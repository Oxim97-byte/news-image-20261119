// news-image-20261119 — entry runner (Node 22, standard library only).
//
// The repository holds one file, entry.png: a single front page of
// "WORLD NEWS" for Thursday, 19 November 2026. The page is an AI-drawn
// hero scene plus headlines typeset with PIL, so the whole day reads at
// thumbnail size. This program is only a courier:
//
//   1. Load entry.png and check it against the competition's image gate:
//      a real PNG or JPEG, no more than 1 MiB, no side over 1024 px.
//   2. Copy it byte for byte into $MAKEFUN_OUTPUT_DIR/entry.png
//      (default /output), making the directory first if needed.
//   3. Read the copy back and compare every byte, so a short or
//      half-written file can never slip through quietly.
//
// The size is read straight out of the file header — no pixel decoding,
// no network, no third-party code.
//
// Try it locally with:
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The competition's limits for the image file.
const MAX_BYTES = 1_048_576; // 1 MiB
const MAX_EDGE = 1024; // pixels

// Stop the run with a message the runner can show the entrant.
function fail(why: string): never {
  throw new Error(`news-image-20261119 entry rejected: ${why}`);
}

// Read (width, height) from a JPEG or PNG header without decoding pixels.
// JPEG: walk the markers until a Start Of Frame segment gives the size.
// PNG: width and height are fixed offsets inside the IHDR chunk.
function dimensions(buf: Buffer): [number, number] {
  const jpeg = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
  if (jpeg) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) fail('JPEG is malformed: expected a marker byte');
      const mark = buf[at + 1];
      if (mark === 0xd9) break; // end of image, no frame found
      const seg = buf.readUInt16BE(at + 2);
      const frame =
        mark >= 0xc0 && mark <= 0xcf &&
        mark !== 0xc4 && mark !== 0xc8 && mark !== 0xcc;
      if (frame) {
        return [buf.readUInt16BE(at + 7), buf.readUInt16BE(at + 5)];
      }
      at += 2 + seg;
    }
    fail('JPEG has no Start Of Frame segment, so its size is unknown');
  }

  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = buf.length >= 24 && sig.every((b, i) => buf[i] === b);
  const hasIhdr =
    buf.length >= 24 &&
    buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52;
  if (isPng && hasIhdr) {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }

  fail('entry.png is neither a JPEG nor a PNG file');
}

// --- Step 1: load and check -------------------------------------------
const here = new URL('./entry.png', import.meta.url);
let image: Buffer;
try {
  image = readFileSync(here);
} catch {
  fail('entry.png is missing next to main.ts — nothing to check or copy');
}

if (image.length > MAX_BYTES) {
  fail(`entry.png is ${image.length} bytes, over the ${MAX_BYTES} byte limit`);
}
const [width, height] = dimensions(image);
if (width > MAX_EDGE || height > MAX_EDGE) {
  fail(`entry.png is ${width}x${height}px, over the ${MAX_EDGE}x${MAX_EDGE}px limit`);
}

// --- Step 2: copy byte for byte ---------------------------------------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'entry.png');
writeFileSync(outPath, image);

// --- Step 3: verify the copy ------------------------------------------
// Buffer.equals compares every byte, so a truncated write fails loudly
// instead of shipping a corrupt image to the grader.
const again = readFileSync(outPath);
if (!again.equals(image)) {
  fail(`output file ${outPath} does not match entry.png byte for byte`);
}

console.log(`wrote ${outPath} (${width}x${height}px, ${image.length} bytes)`);
