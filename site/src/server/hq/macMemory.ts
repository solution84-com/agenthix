import { execFileSync } from 'node:child_process'

const VM_STAT_TIMEOUT_MS = 2_000

/**
 * On macOS, `os.freemem()` is free pages alone, a few hundred megabytes on a busy machine, while the pages the kernel
 * hands back on demand (inactive, speculative, purgeable) count as available, as Linux's MemAvailable counts them.
 */
export function macAvailableBytes(vmStat: string): number | null {
  const pageSize = /page size of (\d+) bytes/.exec(vmStat)
  if (!pageSize) return null
  const pages = (name: string) => Number(new RegExp(`Pages ${name}:\\s+(\\d+)\\.`).exec(vmStat)?.[1] ?? 0)
  return (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * Number(pageSize[1])
}

/** `vm_stat` read and parsed, or null when it cannot be run or read. */
export function readMacAvailableBytes(): number | null {
  try {
    return macAvailableBytes(execFileSync('vm_stat', { encoding: 'utf8', timeout: VM_STAT_TIMEOUT_MS }))
  } catch {
    return null
  }
}
