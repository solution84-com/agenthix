/**
 * The PDF viewer's files (spec part 2): its script and style, pdf.js's worker and the data pdf.js reads (standard
 * fonts, character maps, image decoders), as the build left them in `dist/viewer/pdf`. Read once at start into memory
 * and looked up by exact name, so a request's path is never joined to a folder: nothing outside the build, no link and
 * no file of a type the viewer does not use can be served.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

export type ViewerAsset = { body: Buffer; contentType: string; etag: string }
export type ViewerAssets = ReadonlyMap<string, ViewerAsset>

const SCRIPT = 'text/javascript; charset=utf-8'
const TYPES: Record<string, string> = {
  '.js': SCRIPT,
  '.mjs': SCRIPT,
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/octet-stream',
}

/** The viewer's files by their path under `/viewer/pdf/`, or null when the folder is not there (a relay not built). */
export function loadViewerAssets(dir: string): ViewerAssets | null {
  try {
    if (!lstatSync(dir).isDirectory()) return null
  } catch {
    return null
  }
  const assets = new Map<string, ViewerAsset>()
  const walk = (folder: string, prefix: string) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name)
      const stat = lstatSync(full)
      if (stat.isDirectory()) walk(full, `${prefix}${name}/`)
      else if (stat.isFile() && TYPES[extname(name)]) {
        const body = readFileSync(full)
        const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
        assets.set(`${prefix}${name}`, { body, contentType: TYPES[extname(name)], etag })
      }
    }
  }
  walk(dir, '')
  return assets
}
