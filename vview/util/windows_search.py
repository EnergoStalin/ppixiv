# This gives an interface to Windows Search, returning results similar to
# os.scandir.

import asyncio, time, os, stat, logging, threading, queue
import concurrent.futures
from pathlib import Path
from pprint import pprint

log = logging.getLogger(__name__)

from . import windows_search_api
escape_sql = windows_search_api.escape_sql

FILE_ATTRIBUTE_READONLY = 0x01
FILE_ATTRIBUTE_DIRECTORY = 0x10

class SearchDirEntryStat:
    """
    This is an os.stat_result for SearchDirEntry.

    We don't use os.stat_result itself, since we want to calculate a few fields
    on-demand to avoid overhead when they aren't used.
    """
    def __init__(self, data):
        self._data = data

        self.st_size = data['SYSTEM.SIZE']
        self._st_atime = None
        self.__st_birthtime = None
        self._st_mtime = None

        # SYSTEM.FILEATTRIBUTES is WIN32_FIND_DATA.dwFileAttributes.  Convert
        # it to st_mode in the same way Python does.
        attr = data['SYSTEM.FILEATTRIBUTES']
        if attr & FILE_ATTRIBUTE_DIRECTORY:
            mode = stat.S_IFDIR | 0o111
        else:
            mode = stat.S_IFREG

        if attr & FILE_ATTRIBUTE_READONLY:
            mode |= 0o444
        else:
            mode |= 0o666

        self.st_mode = mode

    def __repr__(self):
        fields = []
        for field in ('st_mode', 'st_dev', 'st_size', 'st_atime', 'st_mtime', 'st_birthtime'):
            fields.append('%s=%s' % (field, getattr(self, field)))
        return f'SearchDirEntryStat({ ", ".join(fields) })'

    # These fields aren't available.
    @property
    def st_ino(self): return 0
    @property
    def st_nlink(self): return 1
    @property
    def st_uid(self): return 0
    @property
    def st_gid(self): return 0
        
    # The only related field is System.VolumeId, but that's not the same
    # as BY_HANDLE_FILE_INFORMATION.dwVolumeSerialNumber.
    @property
    def st_dev(self): return 0

    # adodbapi's parsing for these timestamps is pretty slow and is the overwhelming
    # bottleneck if we parse it for all files.  Since most callers don't use all of
    # these, parse them on demand.
    #
    # time.timezone converts these from local time to UTC.
    @property
    def st_atime(self):
        if self._st_atime is not None:
            return self._st_atime

        self._st_atime = self._data['SYSTEM.DATEACCESSED'].timestamp() - time.timezone
        return self._st_atime

    @property
    def st_birthtime(self):
        if self._st_birthtime is not None:
            return self._st_birthtime

        self.__st_birthtime = self._data['SYSTEM.DATECREATED'].timestamp() - time.timezone
        return self.__st_birthtime

    @property
    def st_mtime(self):
        if self._st_mtime is not None:
            return self._st_mtime

        self._st_mtime = self._data['SYSTEM.DATEMODIFIED'].timestamp() - time.timezone
        return self._st_mtime

def _matches_range(range, value):
    """
    range is (min, max).  Return true if min <= value <= max.  If range is None, there's no
    filter, so the value always matches.  min and max can be None.
    """
    if range is None:
        return True
    if range[0] is not None and range[0] > value:
        return False
    if range[1] is not None and range[1] < value:
        return False
    return True

class SearchDirEntry(os.PathLike):
    """
    A DirEntry-like class for search results.

    This doesn't implement follow_symlinks, but accepts the parameter for
    compatibility with DirEntry.
    """
    def __init__(self, data):
        self._data = data
        self._path = data['SYSTEM.ITEMPATHDISPLAY']
        self._stat = None

    @property
    def metadata(self):
        """
        Return any extra metadata that we got from the search.
        """
        result = { }

        if self._data['SYSTEM.IMAGE.HORIZONTALSIZE']:
            result['width'] = self._data['SYSTEM.IMAGE.HORIZONTALSIZE']

        if self._data['SYSTEM.IMAGE.VERTICALSIZE']:
            result['height'] = self._data['SYSTEM.IMAGE.VERTICALSIZE']

        return result

    @property
    def path(self):
        return self._path

    @property
    def name(self):
        return os.path.basename(self._path)

    def is_dir(self, *, follow_symlinks=True):
        return self._data['SYSTEM.ITEMTYPE'] == 'Directory'

    def is_file(self, *, follow_symlinks=True):
        return self._data['SYSTEM.ITEMTYPE'] != 'Directory'

    def exists(self, *, follow_symlinks=True):
        return True

    @property
    def is_symlink(self):
        return False

    def stat(self, *, follow_symlinks=True):
        if self._stat is not None:
            return self._stat

        self._stat = SearchDirEntryStat(self._data)
        return self._stat

    @property
    def data(self):
        pass

    def __fspath__(self):
        return self._path

    def __repr__(self):
        return 'SearchDirEntry(%s)' % self._path

# This is yielded as a result if the query times out.
class SearchTimeout: pass

def search(*args,
        paths,

        # An SQL ORDER BY statement to order results.  See library.sort_orders.
        order=None,
        
        # A sort function that takes a DirEntry and returns a key.  This should match order.
        # This is used if we fall back to _fallback_search.
        order_fs=None,

        **kwargs):
    paths = [Path(path) for path in paths]

    unseen_paths = set(paths)
    for result in _windows_search(*args, paths=paths, order=order, **kwargs):
        if result is not SearchTimeout:
            # Remove entries from unseen_paths if this path is within any of them.
            path = Path(result.path)
            for unseen_path in list(unseen_paths):
                try:
                    path.relative_to(unseen_path)
                except ValueError:
                    continue
                unseen_paths.remove(unseen_path)

        yield result

    # If a path didn't get any results at all, it might not be enabled for indexing.
    # Do a quick check to see if it's possible to get results here.
    for unseen_path in list(unseen_paths):
        log.warn(f'No results for {unseen_path}')

        query = f"SELECT TOP 1 System.ItemPathDisplay FROM SystemIndex WHERE scope='file:%s'" % escape_sql(str(unseen_path))

        recordset = list(windows_search_api.search(query=query, timeout=1))
        if len(recordset) > 0:
            unseen_paths.remove(unseen_path)

    for unseen_path in list(unseen_paths):
        for result in _fallback_search(*args, paths=[unseen_path], order_fs=order_fs, **kwargs):
            yield result

def _windows_search(*,
        paths=None,

        # If set, return only the file with this exact path.
        exact_path=None,

        # Filter for files with this exact basename:
        filename=None,

        substr=None,
        recurse=True,
        contents=None,
        media_type=None, # "images" or "videos"
        total_pixels=None,
        aspect_ratio=None,

        # If None, a default timeout will be used.  If the request times out, an error
        # will be thrown.
        #
        # If 0, no timeout will be used.
        #
        # If positive, the given timeout will be used.  If the search times out, a
        # result of SearchTimeout will be yielded and no exception will be raised.
        timeout=None,

        # An SQL ORDER BY statement to order results.  See library.sort_orders.
        order=None,
        include_files=True,
        include_dirs=True,
    ):

    yield_timeouts = (timeout is not None)
    if timeout is None:
        timeout = 10

    select = [
        # These fields are required for SearchDirEntry.
        'SYSTEM.ITEMPATHDISPLAY',
        'SYSTEM.ITEMTYPE',
        'SYSTEM.DATEACCESSED',
        'SYSTEM.DATEMODIFIED',
        'SYSTEM.DATECREATED',
        'SYSTEM.FILEATTRIBUTES',
        'SYSTEM.SIZE',

        # The rest are optional.
        'SYSTEM.RATING',
        'SYSTEM.IMAGE.HORIZONTALSIZE',
        'SYSTEM.IMAGE.VERTICALSIZE',
        'SYSTEM.KEYWORDS',
        'SYSTEM.ITEMAUTHORS',
        'SYSTEM.TITLE',
        'SYSTEM.COMMENT',
        'SYSTEM.MIMETYPE',
    ]

    where = []

    # We never make searches without having either a list of paths or an exact
    # path, since that would search the entire filesystem.
    assert paths or exact_path
    if paths:
        # If we're recursing, limit the search with scope.  If not, filter on
        # the parent directory.
        parts = []
        if recurse:
            for path in paths:
                parts.append("scope = '%s'" % escape_sql(str(path)))
        else:
            for path in paths:
                parts.append("directory = '%s'" % escape_sql(str(path)))
        where.append(f"({ ' OR '.join(parts) })")

    if exact_path is not None:
        where.append("SYSTEM.ITEMPATHDISPLAY = '%s'" % escape_sql(str(exact_path)))
    if contents:
        where.append("""CONTAINS(System.Search.Contents, '"%s"')""" % escape_sql(str(contents)))
    if filename is not None:
        where.append("SYSTEM.FILENAME = '%s'" % escape_sql(str(filename)))
        
    # Add filters.
    if substr is not None:
        for word in substr.split(' '):
            # Note that the double-escaping is required to make substring searches
            # work.  '"file*"' will prefix match "file*", but 'file*' won't.  This
            # seems to be efficient at prefix and suffix matches.
            where.append("""CONTAINS(SYSTEM.FILENAME, '"*%s*"')""" % escape_sql(word))

    if not include_files:
        where.append("SYSTEM.ITEMTYPE = 'Directory'")
    if not include_dirs:
        where.append("SYSTEM.ITEMTYPE != 'Directory'")

    if media_type == 'images':
        where.append("SYSTEM.KIND = 'picture'")
    elif media_type == 'videos':
        # Include GIFs when searching for videos.  We can't filter for animated GIFs here,
        # so include them and let the caller finish filtering them.
        where.append("(SYSTEM.KIND = 'video' OR SYSTEM.ITEMTYPE = '.gif')")

    # where.append("(SYSTEM.ITEMTYPE = 'Directory' OR SYSTEM.KIND = 'picture' OR SYSTEM.KIND = 'video')")

    # If sort_results is true, sort directories first, then alphabetical.  This is
    # useful but makes the search slower.
    if order is None:
        order = ''

    query = f"""
        SELECT {', '.join(select)}
        FROM SystemIndex 
        WHERE {' AND '.join(where)}
        {order}
    """

    start_time = time.time()
    timed_out = False
    try:
        for row in windows_search_api.search(timeout=timeout, query=query):
            # Handle search filters that the index doesn't do for us.  This is just a best-effort
            # to filter these early, since if we can do it directly from the search rows, it's faster
            # than having it go through the higher-level filtering.
            if row['SYSTEM.IMAGE.HORIZONTALSIZE'] is not None and row['SYSTEM.IMAGE.VERTICALSIZE'] is not None:
                if not _matches_range(aspect_ratio, row['SYSTEM.IMAGE.HORIZONTALSIZE'] / row['SYSTEM.IMAGE.VERTICALSIZE']):
                    continue

            if row['SYSTEM.IMAGE.HORIZONTALSIZE'] is not None and row['SYSTEM.IMAGE.VERTICALSIZE'] is not None:
                if not _matches_range(total_pixels, row['SYSTEM.IMAGE.HORIZONTALSIZE'] * row['SYSTEM.IMAGE.VERTICALSIZE']):
                    continue

            entry = SearchDirEntry(row)
            yield entry

    except Exception as e:
        # How do we figure out if this exception is from a timeout?  The HResult in the
        # exception is just "Exception occurred".  Make a guess by comparing the duration
        # to what we expect the timeout to be.  The timeout is an integer, so it can never
        # be less than one full second.
        runtime = time.time() - start_time
        if timeout != 0 and runtime >= timeout - 0.5:
            # Exit the exception handler before yielding the timeout, so any exceptions
            # during that yield don't cause nested exceptions.
            timed_out = True
        else:
            log.exception('Windows search error')

    # If the user explicitly requested a timeout, return SearchTimeout to let him know that
    # the results were incomplete.  If no timeout was requested, raise an exception.  The
    # caller isn't explicitly handling timeouts, so treat this as an error to prevent possibly
    # incomplete results from being committed to the database.
    if timed_out:
        log.warn(f'Windows Search probably timed out.  Timeout: {timeout} Time elapsed: {runtime}')
        if yield_timeouts:
            yield SearchTimeout
        else:
            raise Exception('The search timed out')

# This does a direct recursive search for files, as a slow fallback when Windows indexing
# isn't available.  This only supports filters that we can implement reasonably quickly.
# This is just enough to make things functional where we can't use search, like over network
# mounts.
def _fallback_search(*,
        paths=None,
        exact_path=None,
        filename=None,

        substr=None,
        recurse=True,
        media_type=None,
        order_fs=None,

        include_files=True,
        include_dirs=True,

        # Not supported:
        contents=None,
        total_pixels=None,
        aspect_ratio=None,
        timeout=None,
    ):

    if contents: log.warn('Contents search not supported in fallback search')
    if total_pixels: log.warn('Total pixels search not supported in fallback search')
    if aspect_ratio: log.warn('Aspect ratio search not supported in fallback search')

    if paths is not None:
        paths = [Path(path) for path in paths]
        paths = list(set(paths))
    if exact_path is not None:
        paths = [Path(exact_path)]

    # When we're scanning over a network, we may be heavily limited by latency to the server,
    # so running several scandirs in parallel can speed up the scan significantly.
    lock = threading.Lock()
    result_queue = queue.Queue()

    # Protected by lock:
    tasks = {}
    finished_paths = set()
    cancel = False

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        def scan_directory(path):
            try:
                # If we were cancelled while this job was waiting in the queue, stop.
                with lock:
                    if cancel:
                        return

                for entry in os.scandir(path):
                    # Stop if we're cancelled mid-job.
                    with lock:
                        if cancel:
                            return

                    # Push results back to the main loop.                
                    result_queue.put(('entry', entry))

                    # If we're recursing and this is a directory, submit this directory.
                    if recurse and entry.is_dir():
                        submit_directory(entry.path)
            finally:
                result_queue.put(('finished', path))

        def submit_directory(path):
            with lock:
                if path in finished_paths:
                    return

                tasks[path] = executor.submit(scan_directory, path)
                finished_paths.add(path)

        # Queue top-level directories.
        for path in paths:
            submit_directory(path)

        try:
            results = []
            while tasks or not result_queue.empty():
                result_type, result = result_queue.get()
                if result_type == 'entry':
                    entry = result
                    if filename is not None and entry.name != filename:
                        continue
                    if not include_files and entry.is_file():
                        continue
                    if not include_dirs and entry.is_dir():
                        continue
                    if substr is not None:
                        if not all(word.lower() in entry.name.lower() for word in substr.split(' ')):
                            continue

                    if media_type == 'images':
                        if not entry.name.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.bmp')):
                            continue
                    if media_type == 'videos':
                        if not entry.name.lower().endswith(('.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.gif')):
                            continue

                    if not order_fs:
                        yield entry
                    else:
                        results.append(entry)
                elif result_type == 'finished':
                    with lock:
                        del tasks[result]
        finally:
            # If we exit for any reason while jobs are still running, tell them to cancel.
            with lock:
                cancel = True

        # If we're sorting results, sort and yield them now.
        if order_fs:
            results.sort(key=order_fs)
            for entry in results:
                yield entry

def test():
    path=Path(r'F:\stuff\ppixiv\python\temp')
    for idx, entry in enumerate(search(paths=[path], timeout=1, substr='png')):
        if entry is SearchTimeout:
            log.warn('Timed out')
        if entry is None:
            continue

        log.info(entry)
        st = os.stat(entry.path)
        # log.info(entry.is_file())
        # log.info(entry.is_dir())

if __name__ == '__main__':
    test()
