from pathlib import Path

# Get this from pywin32, not from adodbapi:
try:
    import adodbapi
except ImportError:
    adodbapi = None
    print('Windows search not available')

# adodbapi seems to have no way to escape strings, and Search.CollatorDSO doesn't seem
# to support parameters at all.
def escape_sql(s):
    result = ''
    for c in s:
        if c == '\'':
            result += "'"
        result += c
    return result

def search(top, substr, include_dirs=True, include_files=True):
    top = str(top)
    if adodbapi is None:
        return

    try:
        conn = adodbapi.connect('Provider=Search.CollatorDSO; Extended Properties="Application=Windows"')
    except Exception as e:
        print('Couldn\'t connect to search: %s' % str(e))
        return

    try:
        with conn:
            # First search for directories, then files, sorting each by filename.  I haven't
            # found a functioning way to do this with this pidgin not-really-SQL API.
            for search_directories in (True, False):
                if search_directories and not include_dirs:
                    continue
                if not search_directories and not include_files:
                    continue

                where = []
                where.append("scope = '%s'" % escape_sql(top))
                for word in substr.split(' '):
                    where.append("CONTAINS(System.FileName, '%s')" % escape_sql(word))

                if search_directories:
                    where.append("System.ItemType = 'Directory'")
                else:
                    where.append("System.ItemType <> 'Directory'")

                query = """
                    SELECT System.ItemPathDisplay
                    FROM SystemIndex 
                    WHERE %(where)s
                    ORDER BY System.FileName ASC
                """ % {
                    'where': ' AND '.join(where),
                }

                with conn.cursor() as cursor:
                    cursor.execute(query)
                    while True:
                        row = cursor.fetchone()
                        if row is None:
                            break

                        path, = row

                        yield path, search_directories
    except Exception as e:
        print('Windows search error:', e)

def test():
    for path, is_dir in search(Path('e:/'), 'a', include_files=False):
        print(path, is_dir)

if __name__ == '__main__':
    test()