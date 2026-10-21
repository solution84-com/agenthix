import type { SiteListEntry } from '../siteViews'

/** Where a site is added and removed: hq has no control over a site (host-management spec §10). */
export const FLEET_ADMINS_ADD_SITES = 'A fleet admin adds and removes sites in the Fleet Console.'

export type Tone = 'ok' | 'attention' | 'quiet'

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A day without its year when it is this year: "3 Oct". */
export function dayText(at: Date | string, now = new Date()): string {
  const d = new Date(at)
  const text = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? text : `${text} ${d.getFullYear()}`
}

/** "13:02" today, "08:12 yesterday", "08:12 on 3 Oct" before that. */
export function sinceText(at: Date | string, now = new Date()): string {
  const d = new Date(at)
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000)
  if (days <= 0) return clock(d)
  if (days === 1) return `${clock(d)} yesterday`
  return `${clock(d)} on ${dayText(d, now)}`
}

export function bytesText(bytes: number): string {
  const gb = bytes / 1e9
  return gb >= 100 ? `${Math.round(gb)} GB` : gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

export function removalText(site: Pick<SiteListEntry, 'removal'>, now = new Date()): string {
  const r = site.removal
  if (!r) return 'Removed'
  const when = r.at ? ` on ${dayText(r.at, now)}` : ''
  if (r.leftByItself) return `Left by itself${when}`
  return `Removed${r.by ? ` by ${r.by.name}` : ''}${when}`
}
