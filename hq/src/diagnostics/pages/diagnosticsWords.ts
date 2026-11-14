import type { SiteProblem } from '../../sites/siteStanding'
import { bytesText, dayText, plural, sinceText } from '../../sites/pages/siteWords'
import { pressFailureWords } from '../../shared/failureWords'

export { bytesText, plural, sinceText }

const pad = (n: number) => String(n).padStart(2, '0')

export const clock = (at: Date | string) => {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "10 Oct 14:31:58" for a log line. */
export function lineTime(at: string): string {
  const d = new Date(at)
  return `${dayText(d)} ${clock(d)}:${pad(d.getSeconds())}`
}

export const LEVEL_LABEL = { error: 'Error', warn: 'Warn', info: 'Info' } as const

/** What a site's problem reads as in a card: the same states Execution Sites uses. */
export function problemText(p: SiteProblem): string {
  switch (p.kind) {
    case 'upgrade': return 'Needs upgrading'
    case 'hqSiteDown': return `Not running since ${sinceText(p.since)}`
    case 'notConnectedWithWork': return `Not connected since ${sinceText(p.since)}`
    case 'dockerDown': return 'Docker is not running'
    case 'diskNearlyFull': return 'Disk nearly full'
    case 'memoryNearlyFull': return 'Nearly out of memory'
    case 'removedWithProjects': return 'Removed'
  }
}

/** Saves text as a file in the browser. */
export function saveFile(fileName: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function errorMessage(err: unknown): string {
  return pressFailureWords(err)
}
