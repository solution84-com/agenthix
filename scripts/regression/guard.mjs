// What keeps the regression from taking the machine down, whatever its mode: a step waits while memory is short or swap
// grows, close-out mode refuses to start beside another heavy test run (schedule.mjs sizes its steps), and the run
// stops itself when free memory falls under a tenth. Every reading is passed in, so the tests need no real load.
import { execFileSync } from 'node:child_process'
import { freeMemoryPercent } from './machine.mjs'

export const HOLD_UNDER = 25
export const ABORT_UNDER = 10
// Swap that grew by more than this since the last reading is the machine paging under load.
const SWAP_GROWTH_MB = 100

/** 'go', 'hold' (wait before the next step) or 'abort' (stop the run). A reading that is missing does not hold. */
export function memoryVerdict({ free, swapNow, swapBefore, holdUnder = HOLD_UNDER }) {
  if (free !== null && free < ABORT_UNDER) return 'abort'
  if (free !== null && free < holdUnder) return 'hold'
  if (swapNow !== null && swapBefore !== null && swapNow - swapBefore > SWAP_GROWTH_MB) return 'hold'
  return 'go'
}

/** `ps -axo pid=,ppid=,command=` as { pid, ppid, command }. */
export function parseProcesses(text) {
  return text.split('\n').map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }))
}

/** `self` and every process descended from it. */
export function ownTree(processes, self) {
  const tree = new Set([self])
  let grew = true
  while (grew) {
    grew = false
    for (const p of processes) if (!tree.has(p.pid) && tree.has(p.ppid)) { tree.add(p.pid); grew = true }
  }
  return tree
}

// A development server (`wasp start`) is not a heavy run: a person may keep theirs open. Compiling or building is.
const HEAVY = [['vitest', /\bvitest\b/], ['playwright', /\bplaywright\b/], ['wasp', /\bwasp(-bin)?\s+(compile|build)\b/]]

// A shell is never the run itself: `heavy` (a bash script) waiting in the lock's queue and an agent's `zsh -c` name the
// test command without running it. The run they start is a child of its own, and that child is what counts.
const SHELL = /^(\S*\/)?(ba|z|da|fi)?sh$/

/** Why close-out mode may not start here, or null: a heavy test run of another process tree. */
export function otherHeavyRun({ processes, self }) {
  const mine = ownTree(processes, self)
  for (const p of processes) {
    if (mine.has(p.pid) || SHELL.test(p.command.split(/\s+/)[0])) continue
    const hit = HEAVY.find(([, re]) => re.test(p.command))
    if (hit) return `process ${p.pid} is a ${hit[0]} run of its own: ${p.command.slice(0, 120)}`
  }
  return null
}

export function readProcesses() {
  try {
    return parseProcesses(execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
  } catch {
    return []
  }
}

/** Reads free memory every `everyMs` and calls `onAbort(free)` once, the first time it is under ABORT_UNDER. */
export class MemoryWatch {
  constructor({ read = freeMemoryPercent, everyMs = 5000, onAbort }) {
    Object.assign(this, { read, everyMs, onAbort, timer: null, fired: false })
  }

  start() {
    this.timer = setInterval(() => {
      const free = this.read()
      if (!this.fired && free !== null && free < ABORT_UNDER) {
        this.fired = true
        this.onAbort(free)
      }
    }, this.everyMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
  }
}
