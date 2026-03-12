// Generates minimal solid-color PNG icons for the Chrome extension.
// Color: indigo #6366f1 (matches the Nexus UI)
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../extension/icons');
mkdirSync(outDir, { recursive: true });

// RGBA color: #6366f1 ff
const R = 0x63, G = 0x66, B = 0xf1, A = 0xff;

function uint32BE(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = uint32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = uint32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBytes]);
}

function makePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.concat([
    uint32BE(size),  // width
    uint32BE(size),  // height
    Buffer.from([8, 6, 0, 0, 0]) // 8-bit RGBA, deflate, adaptive filter, no interlace
  ]);

  // Raw pixel data: for each row, filter byte (0=None) + size*4 RGBA bytes
  const rowSize = 1 + size * 4;
  const raw = Buffer.allocUnsafe(size * rowSize);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    raw[offset] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 4;
      raw[px]     = R;
      raw[px + 1] = G;
      raw[px + 2] = B;
      raw[px + 3] = A;
    }
  }

  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const file = resolve(outDir, `icon${size}.png`);
  writeFileSync(file, makePng(size));
  console.log(`Generated ${file}`);
}
