import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, "..", "public", "icons");
const logo = readFileSync(path.join(outDir, "logoGym.png"));

// Sampled from the logo's own background so the maskable safe-zone matches it.
const MASKABLE_BG = "#ff3131";

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  await sharp(logo)
    .resize(t.size, t.size, { fit: "cover" })
    .png()
    .toFile(path.join(outDir, t.file));
  console.log(`Generated ${t.file}`);
}

// Maskable icon needs extra safe-zone padding per the Android adaptive icon spec.
const maskableSize = 512;
await sharp(logo)
  .resize(Math.round(maskableSize * 0.7), Math.round(maskableSize * 0.7), { fit: "cover" })
  .extend({
    top: Math.round(maskableSize * 0.15),
    bottom: Math.round(maskableSize * 0.15),
    left: Math.round(maskableSize * 0.15),
    right: Math.round(maskableSize * 0.15),
    background: MASKABLE_BG,
  })
  .png()
  .toFile(path.join(outDir, "maskable-512.png"));
console.log("Generated maskable-512.png");

// Build favicon.ico (16x16 + 32x32, PNG-encoded entries — supported by all modern readers).
const faviconSizes = [16, 32];
const pngBuffers = await Promise.all(
  faviconSizes.map((size) => sharp(logo).resize(size, size, { fit: "cover" }).png().toBuffer())
);

const headerSize = 6 + 16 * faviconSizes.length;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(faviconSizes.length, 4); // image count

let offset = headerSize;
faviconSizes.forEach((size, i) => {
  const entryOffset = 6 + i * 16;
  const buf = pngBuffers[i];
  header.writeUInt8(size, entryOffset + 0); // width (256 would wrap to 0, unused here)
  header.writeUInt8(size, entryOffset + 1); // height
  header.writeUInt8(0, entryOffset + 2); // color count (0 = no palette)
  header.writeUInt8(0, entryOffset + 3); // reserved
  header.writeUInt16LE(1, entryOffset + 4); // color planes
  header.writeUInt16LE(32, entryOffset + 6); // bits per pixel
  header.writeUInt32LE(buf.length, entryOffset + 8); // image data size
  header.writeUInt32LE(offset, entryOffset + 12); // image data offset
  offset += buf.length;
});

writeFileSync(path.join(dir, "..", "app", "favicon.ico"), Buffer.concat([header, ...pngBuffers]));
console.log("Generated app/favicon.ico");
