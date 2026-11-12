import zlib from 'node:zlib'
import sharp from 'sharp'

/**
 * A small real PNG whose header (IHDR) is rewritten to declare `side` × `side` pixels, its checksum made good: what a
 * decompression bomb looks like to a decoder before it decodes anything.
 */
export async function pngDeclaring(side: number): Promise<Buffer> {
  const png = Buffer.from(await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer())
  // The signature (8 bytes), then IHDR: its length (4), its type (4), width and height (4 each), …, its CRC.
  png.writeUInt32BE(side, 16)
  png.writeUInt32BE(side, 20)
  png.writeUInt32BE(zlib.crc32(png.subarray(12, 29)), 29)
  return png
}
