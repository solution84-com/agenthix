/**
 * The two on-device models' files, served by hq itself from `hq/public/models/` (its README records where each came
 * from). The worker checks each file's SHA-256 before loading it, so a stale or altered copy is refused.
 */

import { SECURE_PAGE_WORDS } from '../../../shared/securePage'

export type ModelFile = { name: string; path: string; sha256: string }

export const SILERO_VAD_FILE: ModelFile = {
  name: 'Silero VAD v6.2.3',
  path: 'models/silero-vad/silero_vad.onnx',
  sha256: '1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3',
}

export const SMART_TURN_FILE: ModelFile = {
  name: 'Smart Turn v3.2 (CPU, int8)',
  path: 'models/smart-turn/smart-turn-v3.2-cpu.onnx',
  sha256: '2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f',
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Only voice loads these models, and a page that is not secure has neither the microphone nor this digest.
  if (!crypto.subtle) throw new Error(SECURE_PAGE_WORDS)
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The file's bytes, refused when they are not the ones recorded. */
export async function checkedModel(file: ModelFile, bytes: Uint8Array): Promise<Uint8Array> {
  const actual = await sha256Hex(bytes)
  if (actual !== file.sha256) throw new Error(`${file.name}: the file served is not the one recorded (SHA-256 ${actual})`)
  return bytes
}
