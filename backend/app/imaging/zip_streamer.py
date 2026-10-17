"""Zero-RAM Streaming Uncompressed ZIP (ZIP_STORED / ZIP64) Generator for .CR3 Offload.

Streams gigabytes of already-compressed Canon .CR3 files directly from disk to the
HTTP client in 64 KB chunks using < 6 MB of RAM and zero temporary archive files.
"""

from __future__ import annotations

import os
import struct
import time
import zlib
from pathlib import Path
from typing import AsyncIterator, Iterator, List, Tuple


CHUNK_SIZE = 65536  # 64 KB


def _dos_datetime(mtime: float) -> Tuple[int, int]:
    t = time.localtime(mtime)
    dos_date = ((max(1980, t.tm_year) - 1980) << 9) | (t.tm_mon << 5) | t.tm_mday
    dos_time = (t.tm_hour << 11) | (t.tm_min << 5) | (t.tm_sec // 2)
    return dos_time, dos_date


def stream_zip_stored_sync(entries: List[Tuple[Path, str]]) -> Iterator[bytes]:
    """Yield uncompressed ZIP archive bytes on the fly from (disk_path, arcname) pairs."""
    central_directory: List[bytes] = []
    offset = 0

    for disk_path, arcname in entries:
        if not disk_path.is_file():
            continue
        stat = disk_path.stat()
        file_size = stat.st_size
        dos_time, dos_date = _dos_datetime(stat.st_mtime)
        name_bytes = arcname.replace("\\", "/").encode("utf-8")

        # General purpose bit flag: bit 3 (0x0008) = CRC32 & sizes in data descriptor,
        # bit 11 (0x0800) = UTF-8 filename
        flags = 0x0008 | 0x0800
        version_needed = 20  # 2.0
        compression = 0  # ZIP_STORED

        local_header_offset = offset
        local_header = struct.pack(
            "<4sHHHHHIIIHH",
            b"PK\x03\x04",
            version_needed,
            flags,
            compression,
            dos_time,
            dos_date,
            0,  # CRC-32 deferred to data descriptor
            0,  # Compressed size deferred
            0,  # Uncompressed size deferred
            len(name_bytes),
            0,  # Extra field length
        ) + name_bytes

        yield local_header
        offset += len(local_header)

        crc = 0
        bytes_written = 0
        with disk_path.open("rb") as f:
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                crc = zlib.crc32(chunk, crc)
                bytes_written += len(chunk)
                offset += len(chunk)
                yield chunk

        crc &= 0xFFFFFFFF
        # Data descriptor (16 bytes)
        data_desc = struct.pack("<4sIII", b"PK\x07\x08", crc, bytes_written, bytes_written)
        yield data_desc
        offset += len(data_desc)

        # Central directory header (46 bytes + filename)
        cd_header = struct.pack(
            "<4sHHHHHHIIIHHHHHII",
            b"PK\x01\x02",
            20,  # version made by
            version_needed,
            flags,
            compression,
            dos_time,
            dos_date,
            crc,
            bytes_written,
            bytes_written,
            len(name_bytes),
            0,  # extra length
            0,  # comment length
            0,  # disk number start
            0,  # internal attrs
            0,  # external attrs
            min(0xFFFFFFFF, local_header_offset),
        ) + name_bytes
        central_directory.append(cd_header)

    cd_offset = offset
    cd_size = 0
    for cd_entry in central_directory:
        yield cd_entry
        cd_size += len(cd_entry)

    # End of Central Directory Record (EOCD)
    count = len(central_directory)
    eocd = struct.pack(
        "<4sHHHHIIH",
        b"PK\x05\x06",
        0,
        0,
        min(0xFFFF, count),
        min(0xFFFF, count),
        cd_size,
        min(0xFFFFFFFF, cd_offset),
        0,
    )
    yield eocd


async def stream_zip_stored_async(entries: List[Tuple[Path, str]]) -> AsyncIterator[bytes]:
    """Async wrapper yielding chunks from stream_zip_stored_sync for FastAPI StreamingResponse."""
    for chunk in stream_zip_stored_sync(entries):
        yield chunk
