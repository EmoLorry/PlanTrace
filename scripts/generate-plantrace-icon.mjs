import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const icoPath = path.join(publicDir, 'plantrace.ico')
const icnsPath = path.join(publicDir, 'plantrace.icns')
const svgPath = path.join(publicDir, 'plantrace-icon.svg')

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function mixColor(a, b, t) {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t),
  ]
}

function over(dst, rgb, alpha) {
  const a = clamp(alpha)
  if (a <= 0) return dst
  const nextA = a + dst.a * (1 - a)
  if (nextA <= 0) return { r: 0, g: 0, b: 0, a: 0 }

  return {
    r: (rgb[0] * a + dst.r * dst.a * (1 - a)) / nextA,
    g: (rgb[1] * a + dst.g * dst.a * (1 - a)) / nextA,
    b: (rgb[2] * a + dst.b * dst.a * (1 - a)) / nextA,
    a: nextA,
  }
}

function sdRoundRect(x, y, cx, cy, hx, hy, radius) {
  const qx = Math.abs(x - cx) - hx + radius
  const qy = Math.abs(y - cy) - hy + radius
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function circleAlpha(x, y, cx, cy, radius, softness) {
  return smoothstep(radius + softness, radius - softness, Math.hypot(x - cx, y - cy))
}

function lineAlpha(x, y, ax, ay, bx, by, width, softness) {
  const vx = bx - ax
  const vy = by - ay
  const wx = x - ax
  const wy = y - ay
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy))
  const px = ax + vx * t
  const py = ay + vy * t
  return smoothstep(width + softness, width - softness, Math.hypot(x - px, y - py))
}

function ellipseStrokeAlpha(x, y, cx, cy, rx, ry, rotation, width, softness, start, end) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - cx
  const dy = y - cy
  const ex = dx * cos + dy * sin
  const ey = -dx * sin + dy * cos
  const angle = Math.atan2(ey / ry, ex / rx)
  let normalized = angle < 0 ? angle + Math.PI * 2 : angle
  let inArc = true

  if (typeof start === 'number' && typeof end === 'number') {
    const s = start < 0 ? start + Math.PI * 2 : start
    const e = end < 0 ? end + Math.PI * 2 : end
    inArc = s <= e ? normalized >= s && normalized <= e : normalized >= s || normalized <= e
  }

  if (!inArc) return 0

  const distance = Math.abs(Math.hypot(ex / rx, ey / ry) - 1) * Math.min(rx, ry)
  return smoothstep(width + softness, width - softness, distance)
}

function renderSample(x, y, size) {
  const aa = 1.35 / size
  const baseAlpha = smoothstep(aa, -aa, sdRoundRect(x, y, 0.5, 0.5, 0.43, 0.43, 0.18))
  let out = { r: 0, g: 0, b: 0, a: 0 }
  if (baseAlpha <= 0) return out

  const diagonal = clamp(0.68 * y + 0.32 * x)
  const radialGlow = clamp(1 - Math.hypot(x - 0.2, y - 0.12) / 0.9)
  const lowerGlow = clamp(1 - Math.hypot(x - 0.72, y - 0.86) / 0.72)
  let bg = mixColor([12, 16, 38], [22, 74, 150], diagonal)
  bg = mixColor(bg, [42, 219, 180], radialGlow * 0.24)
  bg = mixColor(bg, [89, 105, 255], lowerGlow * 0.18)
  out = over(out, bg, baseAlpha)

  const topSheen = smoothstep(0.72, 0.05, y) * smoothstep(-0.08, 0.55, x)
  out = over(out, [255, 255, 255], baseAlpha * topSheen * 0.12)

  const orbitA = ellipseStrokeAlpha(x, y, 0.5, 0.51, 0.35, 0.18, -0.62, 0.006, 0.006, -0.15, Math.PI * 1.42)
  const orbitB = ellipseStrokeAlpha(x, y, 0.5, 0.52, 0.29, 0.36, 0.77, 0.005, 0.006, Math.PI * 0.08, Math.PI * 1.55)
  out = over(out, [188, 240, 255], baseAlpha * orbitA * 0.52)
  out = over(out, [94, 255, 208], baseAlpha * orbitB * 0.38)

  const points = [
    [0.29, 0.63],
    [0.46, 0.42],
    [0.62, 0.55],
    [0.74, 0.34],
  ]

  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    const trace = lineAlpha(x, y, ax, ay, bx, by, 0.012, 0.007)
    out = over(out, [111, 232, 255], baseAlpha * trace * 0.86)
  }

  for (const [cx, cy] of points) {
    const glow = circleAlpha(x, y, cx, cy, 0.067, 0.05)
    const core = circleAlpha(x, y, cx, cy, 0.028, 0.01)
    out = over(out, [72, 215, 255], baseAlpha * glow * 0.34)
    out = over(out, [238, 255, 248], baseAlpha * core * 0.94)
  }

  const star = circleAlpha(x, y, 0.74, 0.34, 0.054, 0.03)
  const starCore = circleAlpha(x, y, 0.74, 0.34, 0.018, 0.008)
  const rayH = lineAlpha(x, y, 0.66, 0.34, 0.82, 0.34, 0.005, 0.004)
  const rayV = lineAlpha(x, y, 0.74, 0.26, 0.74, 0.42, 0.005, 0.004)
  out = over(out, [96, 255, 211], baseAlpha * star * 0.34)
  out = over(out, [245, 255, 241], baseAlpha * starCore)
  out = over(out, [223, 255, 241], baseAlpha * (rayH + rayV) * 0.54)

  const edge = smoothstep(-0.008, 0.018, sdRoundRect(x, y, 0.5, 0.5, 0.43, 0.43, 0.18))
  out = over(out, [255, 255, 255], baseAlpha * (1 - edge) * 0.11)

  return out
}

function renderPixel(px, py, size) {
  const samples = [
    [0.18, 0.18],
    [0.82, 0.18],
    [0.18, 0.82],
    [0.82, 0.82],
  ]
  let pr = 0
  let pg = 0
  let pb = 0
  let pa = 0

  for (const [sx, sy] of samples) {
    const sample = renderSample((px + sx) / size, (py + sy) / size, size)
    pr += sample.r * sample.a
    pg += sample.g * sample.a
    pb += sample.b * sample.a
    pa += sample.a
  }

  pa /= samples.length
  if (pa <= 0) return [0, 0, 0, 0]

  return [
    Math.round(clamp(pr / samples.length / pa, 0, 255)),
    Math.round(clamp(pg / samples.length / pa, 0, 255)),
    Math.round(clamp(pb / samples.length / pa, 0, 255)),
    Math.round(pa * 255),
  ]
}

function createDib(size) {
  const pixelBytes = size * size * 4
  const maskStride = Math.ceil(size / 32) * 4
  const maskBytes = maskStride * size
  const buffer = Buffer.alloc(40 + pixelBytes + maskBytes)

  buffer.writeUInt32LE(40, 0)
  buffer.writeInt32LE(size, 4)
  buffer.writeInt32LE(size * 2, 8)
  buffer.writeUInt16LE(1, 12)
  buffer.writeUInt16LE(32, 14)
  buffer.writeUInt32LE(0, 16)
  buffer.writeUInt32LE(pixelBytes, 20)
  buffer.writeInt32LE(0, 24)
  buffer.writeInt32LE(0, 28)
  buffer.writeUInt32LE(0, 32)
  buffer.writeUInt32LE(0, 36)

  for (let fileY = 0; fileY < size; fileY += 1) {
    const y = size - 1 - fileY
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = renderPixel(x, y, size)
      const offset = 40 + (fileY * size + x) * 4
      buffer[offset] = b
      buffer[offset + 1] = g
      buffer[offset + 2] = r
      buffer[offset + 3] = a
    }
  }

  return buffer
}

function createIco(sizes) {
  const images = sizes.map((size) => ({ size, data: createDib(size) }))
  const headerSize = 6 + images.length * 16
  let offset = headerSize
  const header = Buffer.alloc(headerSize)

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  images.forEach((image, index) => {
    const entry = 6 + index * 16
    header[entry] = image.size === 256 ? 0 : image.size
    header[entry + 1] = image.size === 256 ? 0 : image.size
    header[entry + 2] = 0
    header[entry + 3] = 0
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, ...images.map((image) => image.data)])
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

function createPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1)
    raw[rowOffset] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = renderPixel(x, y, size)
      const offset = rowOffset + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function createIcns(entries) {
  const chunks = entries.map(([type, size]) => {
    const data = createPng(size)
    const chunk = Buffer.alloc(8 + data.length)
    chunk.write(type, 0, 4, 'ascii')
    chunk.writeUInt32BE(chunk.length, 4)
    data.copy(chunk, 8)
    return chunk
  })
  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(totalLength, 4)
  return Buffer.concat([header, ...chunks])
}

function writeSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="44" y1="22" x2="218" y2="232" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1df0c6"/>
      <stop offset="0.34" stop-color="#1b4aa3"/>
      <stop offset="1" stop-color="#0c1026"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#07111f" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="20" y="20" width="216" height="216" rx="48" fill="url(#bg)" filter="url(#soft)"/>
  <path d="M58 151c27-75 108-95 145-43" fill="none" stroke="#d8fbff" stroke-width="5" stroke-linecap="round" opacity=".5"/>
  <path d="M84 197c-25-64 5-133 78-148" fill="none" stroke="#5dffd2" stroke-width="4" stroke-linecap="round" opacity=".38"/>
  <path d="M73 160 118 108l39 32 28-54" fill="none" stroke="#7bf2ff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#f7fff7">
    <circle cx="73" cy="160" r="10"/>
    <circle cx="118" cy="108" r="10"/>
    <circle cx="157" cy="140" r="10"/>
    <circle cx="185" cy="86" r="9"/>
  </g>
  <g stroke="#e9fff6" stroke-width="5" stroke-linecap="round">
    <path d="M185 61v50"/>
    <path d="M160 86h50"/>
  </g>
</svg>
`

  fs.writeFileSync(svgPath, svg, 'utf8')
}

fs.mkdirSync(publicDir, { recursive: true })
writeSvg()
fs.writeFileSync(icoPath, createIco([16, 24, 32, 48, 64, 128, 256]))
fs.writeFileSync(icnsPath, createIcns([
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
]))
console.log(`Generated ${path.relative(root, icoPath)}, ${path.relative(root, icnsPath)} and ${path.relative(root, svgPath)}`)
