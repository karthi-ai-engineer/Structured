// Draws the app icons for the PWA manifest (PLAN.md S7) without any image library: a coral
// square (safe for "maskable" cropping) with the favicon's white pill and coral dot, rendered
// with 4×4 supersampling and written as PNG with Node's zlib.
//
//   node scripts/generate-icons.mjs        # writes public/icons/icon-192.png and icon-512.png
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const CORAL = [239, 99, 81]
const WHITE = [255, 255, 255]
const SAMPLES = 4

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Inside the white pill (a rounded rectangle) and outside the coral dot. */
function isWhite(x, y) {
  const w = 0.3
  const h = 0.62
  const r = w / 2
  const left = 0.5 - w / 2
  const top = 0.5 - h / 2
  if (x < left || x > left + w || y < top || y > top + h) return false
  const cy = Math.min(Math.max(y, top + r), top + h - r)
  const inPill = (x - 0.5) ** 2 + (y - cy) ** 2 <= r ** 2
  const inDot = (x - 0.5) ** 2 + (y - 0.36) ** 2 <= 0.075 ** 2
  return inPill && !inDot
}

function icon(size) {
  const rows = []
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4) // filter byte 0, then RGBA
    for (let px = 0; px < size; px++) {
      let white = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (isWhite((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)) {
            white++
          }
        }
      }
      const t = white / (SAMPLES * SAMPLES)
      const o = 1 + px * 4
      for (let i = 0; i < 3; i++) row[o + i] = Math.round(CORAL[i] * (1 - t) + WHITE[i] * t)
      row[o + 3] = 255
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, icon(size))
  console.log(`icons: wrote public/icons/icon-${size}.png`)
}
