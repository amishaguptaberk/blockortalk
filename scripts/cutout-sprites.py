#!/usr/bin/env python3
"""Flood-fill the black field around each sprite frame.

The numbered PNGs are opaque RGB. The cat's body is also near-black, so a
global color key would punch holes in it. Only pixels connected to the image
border through near-black are cleared. Originals in public/sprites/{purple,red,green}
are left untouched. Output is public/sprites/cutout/.
"""
import struct
import zlib
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "sprites"
OUT = ROOT / "public" / "sprites" / "cutout"
COLORS = ("purple", "red", "green")


def read_rgb(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"not a png: {path}")
    i = 8
    chunks = []
    while i < len(data):
        length, kind = struct.unpack(">I4s", data[i : i + 8])
        i += 8
        chunks.append((kind, data[i : i + length]))
        i += length + 4
    width, height, bit, color = struct.unpack(">IIBB", chunks[0][1][:10])
    if (bit, color) != (8, 2):
        raise SystemExit(f"expected opaque RGB: {path}")
    raw = zlib.decompress(b"".join(body for kind, body in chunks if kind == b"IDAT"))
    rows = []
    pos = 0
    stride = width * 3
    prev = bytearray(stride)
    for _y in range(height):
        filt = raw[pos]
        pos += 1
        row = bytearray(raw[pos : pos + stride])
        pos += stride
        for x in range(stride):
            left = row[x - 3] if x >= 3 else 0
            up = prev[x]
            ul = prev[x - 3] if x >= 3 else 0
            if filt == 1:
                row[x] = (row[x] + left) & 255
            elif filt == 2:
                row[x] = (row[x] + up) & 255
            elif filt == 3:
                row[x] = (row[x] + ((left + up) // 2)) & 255
            elif filt == 4:
                guess = left + up - ul
                pa, pb, pc = abs(guess - left), abs(guess - up), abs(guess - ul)
                pr = left if pa <= pb and pa <= pc else up if pb <= pc else ul
                row[x] = (row[x] + pr) & 255
            elif filt != 0:
                raise SystemExit(f"filter {filt} in {path}")
        rows.append(row)
        prev = row
    return width, height, rows


def write_rgba(path: Path, width: int, height: int, pix: bytearray):
    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + pix[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def cutout(width: int, height: int, rows) -> bytearray:
    pix = bytearray(width * height * 4)
    for y, row in enumerate(rows):
        for x in range(width):
            i = (y * width + x) * 4
            pix[i : i + 3] = row[x * 3 : x * 3 + 3]
            pix[i + 3] = 255

    def field(x: int, y: int) -> bool:
        i = (y * width + x) * 4
        return pix[i] <= 14 and pix[i + 1] <= 14 and pix[i + 2] <= 14

    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height):
            continue
        k = y * width + x
        if seen[k] or not field(x, y):
            continue
        seen[k] = 1
        pix[k * 4 + 3] = 0
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            k = y * width + x
            if pix[k * 4 + 3] == 0:
                continue
            if any(pix[(ny * width + nx) * 4 + 3] == 0 for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                peak = max(pix[k * 4 : k * 4 + 3])
                if peak < 48:
                    pix[k * 4 + 3] = int(255 * peak / 48)
    return pix


def main():
    count = 0
    for color in COLORS:
        for folder in sorted(p for p in (SRC / color).iterdir() if p.is_dir()):
            for frame in sorted(folder.glob("*.png")):
                width, height, rows = read_rgb(frame)
                write_rgba(OUT / color / folder.name / frame.name, width, height, cutout(width, height, rows))
                count += 1
    print(count)


if __name__ == "__main__":
    main()
