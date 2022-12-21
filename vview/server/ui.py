# This handles serving the UI so it can be run independently.

import aiohttp, asyncio, base64, glob, os, json, mimetypes
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from ..util import misc
from ..util.paths import open_path
from ..build.build_ppixiv import Build

root_dir = Path(__file__) / '..' / '..' / '..' # XXX gross
root_dir = root_dir.resolve()

# Work around a bug in the Python mimetypes module: it imports MIME types from
# the Windows registry, allowing them to override the built-in MIME types.  That's
# bad, because there's lot of crap in every Windows registry, which makes mimetypes
# behave unpredictably.  Because of this, we need to explicitly register the MIME
# types we use.  Python should import from the registry first (if at all, this is
# a source of nasty cross-system differences) so the built-in types take priority.
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/scss', '.scss')

def add_routes(router):
    router.add_get('/client/init.js', handle_init)
    router.add_get('/client/{path:.*\.css}', handle_css)
    router.add_get('/client/{path:.*}', handle_client)
    router.add_get('/web/{path:.*}', handle_client)

    router.add_get('/', handle_resource('resources/index.html'))
    router.add_get('/similar', handle_resource('resources/index.html'))

    # Chrome asks for favicon.ico sometimes, such as when viewing an image directly.  Give
    # it a PNG instead.
    router.add_get('/favicon.ico', handle_resource('resources/vview-icon.png'))

def handle_resource(path):
    """
    Handle returning a specific file inside resources.
    """
    path = root_dir / path

    def handle_file(request):
        if not path.exists():
            raise aiohttp.web.HTTPNotFound()

        return aiohttp.web.FileResponse(path, headers={
            'Cache-Control': 'public, no-cache',
        })

    return handle_file

def _get_path_timestamp_suffix(path):
    fs_path = root_dir / Path(path)
    mtime = fs_path.stat().st_mtime

    return f'?{mtime}'

def get_modules():
    modules = {}
    modules_top = Path('web/vview')
    for root, dirs, files in os.walk(modules_top):
        for file in files:
            # web/vview/module/path.js -> [vview/module/path.js] = /web/vview/module/path.js?timestamp
            path = Path(root) / file
            relative_path = path.relative_to(modules_top)
            module_name = 'vview' / relative_path
            
            url_path = '/web/vview' / relative_path
            suffix = _get_path_timestamp_suffix(path)
            modules[module_name.as_posix()] = url_path.as_posix() + suffix

    from pprint import pprint
    pprint(modules)
    return modules

def get_resources():
    build = Build()

    results = {}
    for name, path in build.get_resource_list().items():
        suffix = _get_path_timestamp_suffix(path)

        # Replace the path to .CSS files with their source .SCSS.  They'll be
        # compiled by handle_css.
        if path.suffix == '.scss':
            path = path.with_suffix('.css')

        url = PurePosixPath('/client') / PurePosixPath(path)
        results[name] = url.as_posix() + suffix

    return results

def handle_init(request):
    init = {
        'modules': get_modules(),
        'resources': get_resources(),
    }
    source_files_json = json.dumps(init, indent=4) + '\n'

    return aiohttp.web.Response(body=source_files_json, headers={
        'Content-Type': 'application/json',

        # This is the one file we really don't want cached, since this is where we
        # trigger reloads for everything else if they're modified.
        'Cache-Control': 'no-store',
    })

def handle_client(request):
    path = request.match_info['path']
    as_data_url = 'data' in request.query
    path = Path(path)

    cache_control = 'public, immutable'
    if path in (Path('js/bootstrap.js'), Path('js/bootstrap-native.js')):
        # Don't cache these.  They're loaded before URL cache busting is available.
        cache_control = 'no-store'

    if path.parts[0] == 'js':
        # XXX: Remove this once everything is converted to modules in web/vview.
        path = Path(*path.parts[1:])
        path = 'web/startup' / path
    elif path.parts[0] == 'vview':
        path = Path(*path.parts[1:])
        path = 'web/vview' / path
    elif path.parts[0] == 'resources':
        # OK
        pass
    else:
        raise aiohttp.web.HTTPNotFound()
    
    path = root_dir / path
    path = path.resolve()
    assert path.relative_to(root_dir)

    path = open_path(path)
    if not path.exists():
        raise aiohttp.web.HTTPNotFound()

    headers = {
        'Cache-Control': cache_control,
    }
    
    if as_data_url:
        with open(path, 'rb') as f:
            data = f.read()
            
        mime_type = misc.mime_type(path.name) or 'application/octet-stream'
        data = base64.b64encode(data).decode('ascii')
        data = f'data:{mime_type};base64,' + data
        headers['Content-Type'] = 'text/plain'
        response = aiohttp.web.Response(body=data, headers=headers)
        response.last_modified = os.stat(path).st_mtime
    else:
        response = aiohttp.web.FileResponse(path, headers=headers)

    return response

def handle_css(request):
    path = request.match_info['path']

    path = Path(path)
    path = root_dir / path
    path = path.with_suffix('.scss')
    path = path.resolve()
    assert path.relative_to(root_dir)

    path = open_path(path)
    if not path.exists():
        raise aiohttp.web.HTTPNotFound()

    # Check cache.
    mtime = path.stat().st_mtime
    if_modified_since = request.if_modified_since
    if if_modified_since is not None:
        modified_time = datetime.fromtimestamp(mtime, timezone.utc)
        modified_time = modified_time.replace(microsecond=0)

        if modified_time <= if_modified_since:
            raise aiohttp.web.HTTPNotModified()

    build = Build()

    # The source root for the CSS source map needs to be an absolute URL, since it might be
    # loaded into the user script and a relative domain will resolve to that domain instead
    # of ours.
    base_url = '%s://%s:%i' % (request.url.scheme, request.url.host, request.url.port)
    data = build.build_css(path.path, embed_source_root=f'{base_url}/client')

    response = aiohttp.web.Response(body=data, headers={
        'Cache-Control': 'public, immutable',
        'Content-Type': 'text/css; charset=utf-8',
    })

    response.last_modified = mtime
    return response

    