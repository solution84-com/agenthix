/**
 * `GET /api/demo/voice/:clip`: a recorded voice line from the demo data folder's `voice/`. There only in demo mode,
 * only for a name the scripts' loader accepts (so no path can be asked for), read once and kept, served as audio.
 * No session: the browser's audio element cannot send one, and the clips are the scripts' own, the same for everyone.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { demoDataDir } from '@agenthix/core'
import type { DemoVoiceClipApi } from 'wasp/server/api'
import { demoOn } from '../demoMode'

/** The loader's clip pattern (core's `DEMO_VOICE_CLIP`), which core does not export. */
export const DEMO_CLIP_NAME = /^[a-z0-9][a-z0-9_-]{0,62}\.(mp3|wav|ogg)$/

const TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }

/** The data folder is read-only and holds about twenty clips; this keeps a request from reading the disk twice. */
const kept = new Map<string, Buffer>()

export function forgetClipsForTests(): void {
  kept.clear()
}

async function clipBytes(name: string): Promise<Buffer | null> {
  const known = kept.get(name)
  if (known) return known
  try {
    const bytes = await readFile(path.join(demoDataDir(process.env), 'voice', name))
    kept.set(name, bytes)
    return bytes
  } catch {
    return null
  }
}

export const demoVoiceClipHandler: DemoVoiceClipApi = async (req, res) => {
  const name = req.params.clip
  if (!demoOn() || typeof name !== 'string' || !DEMO_CLIP_NAME.test(name)) return res.status(404).json({ error: 'Not found' })
  const bytes = await clipBytes(name)
  if (!bytes) return res.status(404).json({ error: 'Not found' })
  res.set({
    'Content-Type': TYPES[name.slice(name.lastIndexOf('.') + 1)]!,
    // Asked again before each play (answered "not modified" by its ETag while unchanged), so a clip recorded again
    // reaches a browser that played the old one.
    'Cache-Control': 'public, no-cache',
    'X-Content-Type-Options': 'nosniff',
    // The page may load it from the server's own origin (hq's API address); same-site lets that page play it.
    'Cross-Origin-Resource-Policy': 'same-site',
  })
  return res.send(bytes)
}
