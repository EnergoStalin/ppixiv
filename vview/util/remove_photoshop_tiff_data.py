import io, struct

def remove_photoshop_tiff_data(f):
    try:
        result = _remove_photoshop_tiff_data_inner(f)
        result.seek(0)
        return result
    except OSError:
        # If reading the file failed for some reason, just seek back and return it.
        f.seek(0)
        return f

def _remove_photoshop_tiff_data_inner(f):
    """
    PIL's Tiff reader is really slow when files contain large Photoshop layer data.  It assumes
    tags are tiny and can be read for free, but these tags can be hundreds of MB.  PIL loads them
    repeatedly, even if it's never used.  The call to libtiff also takes a long time when these
    tags exist.
    
    Work around this by loading the TIFF into memory and removing the ImageSourceData tag.  We
    can do this without touching the rest of the file, by just removing it from the tag index.
    
    This makes loading large Photoshop-based TIFFs orders of magnitude faster.
    If the file isn't a TIFF, f will be returned unchanged.
    """

    # Read the header.
    endianness = _read_unpack('<2c', f)

    # II: little-endian
    # MM: big-endian
    if endianness == (b'I', b'I'):
        endian = '<'
    elif endianness == (b'M', b'M'):
        endian = '>'
    else:
        return f

    flags, = _read_unpack(f'{endian}H', f)

    # TiffImagePlugin looks at byte 3 for the "BigTIFF" header.  Isn't that wrong for
    # big-endian files?
    bigtiff = flags == 43
    if flags not in (42, 43):
        raise OSError(f'Not a TIFF file')

    tag_index_offset, = _read_unpack(f'{endian}Q' if bigtiff else f'{endian}L', f)

    # Seek to the tag index and read it.  We don't actually look at tag data, only the
    # index, so this is trivial.
    f.seek(tag_index_offset)
    tag_count_fmt = 'Q' if bigtiff else 'H'
    tag_count, = _read_unpack(f'{endian}{tag_count_fmt}', f)

    tags = []
    tag_fmt = 'HHQ8s' if bigtiff else 'HHL4s'
    for i in range(tag_count):
        tag, typ, count, data = _read_unpack(f'{endian}{tag_fmt}', f)
        tags.append((tag, typ, count, data))

    # A list of (pos, size) that we don't need to include in the output.
    skips = []
    removed_any_tags = False
    new_tags = []
    for tag, tag_type, count, data in tags:
        # Remove ImageSourceData.
        if tag == 37724:
            pos, = struct.unpack(f'{endian}Q' if bigtiff else f'{endian}L', data)
            skips.append((pos, count))
            removed_any_tags = True
            continue

        new_tags.append((tag, tag_type, count, data))

    skips.sort()

    f.seek(0)

    # If we aren't removing any tags, just return the original file, so we don't load
    # the file into memory if we don't need to.
    if not removed_any_tags:
        return f

    # Since we're replacing the tag list, read the file into memory.  In principle
    # we could use a file wrapper to just replace the start of the file, but PIL
    # doesn't handle that and would just load the file into memory anyway.
    #
    # skips is a list of blocks in the output file that we don't need, so we don't
    # spend time loading data for the tags we're omitting.  We'll just skip over that
    # region and leave it empty.
    if skips:
        output = io.BytesIO()
        for pos, size in skips:
            # Read up to the start of the skipped block.
            to_read = pos - f.tell()
            output.write(f.read(to_read))

            # Seek past the skipped block.
            f.seek(size, io.SEEK_CUR)
            output.seek(size, io.SEEK_CUR)

        # Read the read of the file.
        rest = f.read()

        output.write(rest)

        # The generated file should always be the same size as the original.
        assert f.tell() == output.tell()
    else:
        output = f.read()
        output = io.BytesIO(output)

    # Overwrite the tag list.  It'll always be smaller than the original.  The extra
    # leftover data will be ignored.
    new_tag_list = io.BytesIO()
    new_tag_list.write(struct.pack(tag_count_fmt, len(new_tags)))
    for tag, typ, count, data in new_tags:
        new_tag_list.write(struct.pack(tag_fmt, tag, typ, count, data))

    output.seek(tag_index_offset)
    output.write(new_tag_list.getvalue())
    return output

def _read_unpack(fmt, f):
    size = struct.calcsize(fmt)
    data = f.read(size)
    if len(data) != size:
        raise OSError(f'Corrupt EXIF data')
    
    return struct.unpack(fmt, data)
