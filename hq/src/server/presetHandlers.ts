/**
 * Preset Image Handlers
 * =====================
 * Serves avatar and cover preset images directly from the platform assets folder:
 *   <assetsRoot>/avatars/
 *   <assetsRoot>/covers/
 *
 * Assets are read-only and deployed with the app — no runtime copying needed.
 * Drop image files into assets/avatars/ or assets/covers/ and they appear
 * automatically in the picker.
 *
 * Endpoints:
 *   GET /presets/:type          → JSON array of filenames
 *   GET /presets/:type/:filename → serve the image file
 */
import type { Request, Response } from 'express'
import { getHqAssetsRoot } from './hqAssets'
import fs from 'node:fs/promises'
import path from 'node:path'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const VALID_TYPE = /^(avatars|covers)$/

/** The platform preset images the picker serves — also what the agent preset tools read. */
export function presetsDir(type: 'avatars' | 'covers'): string {
  return path.join(getHqAssetsRoot(), type)
}

export async function listPresets(req: Request, res: Response) {
  const { type } = req.params as { type: string }
  if (!VALID_TYPE.test(type)) return res.status(400).json({ error: 'Invalid type' })

  try {
    const entries = await fs.readdir(presetsDir(type as 'avatars' | 'covers'), { withFileTypes: true })
    const files = entries
      .filter(e => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
      .map(e => e.name)
      .sort()
    return res.json(files)
  } catch {
    return res.json([])
  }
}

export async function servePreset(req: Request, res: Response) {
  const { type, filename } = req.params as { type: string; filename: string }
  if (!VALID_TYPE.test(type)) return res.status(400).json({ error: 'Invalid type' })

  if (filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const ext = path.extname(filename).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) return res.status(400).json({ error: 'Unsupported file type' })

  const filePath = path.join(presetsDir(type as 'avatars' | 'covers'), filename)

  try {
    const buf = await fs.readFile(filePath)
    const mime: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    }
    res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(buf)
  } catch {
    return res.status(404).json({ error: 'Preset not found' })
  }
}
