/**
 * Clips to score the models on: synthetic signals made here, and speech made with macOS's `say` where it exists.
 * Generated speech is made in a temporary folder on each run and never kept.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const RATE = 16000

/** Two steady tones, 220 Hz and 1330 Hz: the signal the upstream reference numbers were taken on. */
export function twoTones(seconds = 2): Float32Array {
  return Float32Array.from({ length: seconds * RATE }, (_, n) =>
    0.3 * Math.sin((2 * Math.PI * 220 * n) / RATE) + 0.1 * Math.sin((2 * Math.PI * 1330 * n) / RATE))
}

export const silence = (seconds = 1) => new Float32Array(seconds * RATE)

/** 16-bit mono PCM out of a WAV file, as floats; walks the chunks, since `say` writes more than the minimum. */
export function wavSamples(bytes: Buffer): Float32Array {
  let at = 12
  while (at + 8 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4)
    const size = bytes.readUInt32LE(at + 4)
    if (id === 'data') {
      const samples = new Float32Array(size / 2)
      for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(at + 8 + i * 2) / 32768
      return samples
    }
    at += 8 + size + (size % 2)
  }
  throw new Error('No data chunk in the WAV file')
}

/** Whether `said` can make speech here. Elsewhere (Linux in continuous integration) the tests that need it skip. */
export const speechAvailable = (() => {
  if (process.platform !== 'darwin') return false
  try {
    execFileSync('which', ['say'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

/** `text` spoken by the system's voice, at 16 kHz. */
export function said(text: string): Float32Array {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-clip-'))
  try {
    const file = path.join(dir, 'clip.wav')
    execFileSync('say', ['-o', file, `--data-format=LEI16@${RATE}`, text])
    return wavSamples(readFileSync(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The median of a few timed runs of `run`, after one untimed run to warm up. */
export async function medianMs(run: () => Promise<unknown>, times = 5): Promise<number> {
  await run()
  const taken: number[] = []
  for (let i = 0; i < times; i++) {
    const start = performance.now()
    await run()
    taken.push(performance.now() - start)
  }
  return taken.sort((a, b) => a - b)[Math.floor(times / 2)]!
}
