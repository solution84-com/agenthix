// How many processors each running step uses, measured while it runs, so the next run weighs it by what it really
// costs (schedule.mjs weights). A step's own processes are its process tree. Docker's work runs in Docker's virtual
// machine, outside every tree; its use is shared among the running steps that declare `docker` (the image and container
// steps). Measured from the processor time each process has used (`ps` time), not its decaying %cpu, which reads
// low for processes that started recently. One reading of `ps` costs a few milliseconds.
import { execFileSync } from 'node:child_process'
import { ownTree } from './guard.mjs'

const DOCKER_VM = /com\.apple\.Virtualization\.VirtualMachine|qemu-system|com\.docker\.hyperkit/

/** `[[dd-]hh:]mm:ss.ss` as seconds. */
export function cpuSeconds(text) {
  const [days, rest] = text.includes('-') ? text.split('-') : ['0', text]
  return rest.split(':').map(Number).reduce((a, n) => a * 60 + n, 0) + Number(days) * 86_400
}

/** `ps -axo pid=,ppid=,time=,command=` as { pid, ppid, cpu (processor-seconds used so far), command }. */
export function parseCpu(text) {
  return text.split('\n').map((line) => /^\s*(\d+)\s+(\d+)\s+([\d:.-]+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, time, command]) => ({ pid: Number(pid), ppid: Number(ppid), cpu: cpuSeconds(time), command }))
}

export function readCpu() {
  try {
    return parseCpu(execFileSync('ps', ['-axo', 'pid=,ppid=,time=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
  } catch {
    return []
  }
}

/**
 * Each tracked step's processors between two readings: the processor-seconds its tree's processes used since the last
 * reading (`before`, by pid), over the seconds between them, plus its share of Docker's when it declares `docker`. A
 * process new since the last reading counts all it has used.
 */
export function cpuByStep(rows, tracked, before, seconds) {
  const out = new Map()
  if (!(seconds > 0)) return out
  const used = (r) => Math.max(0, r.cpu - (before.get(r.pid) ?? 0))
  const docker = rows.filter((r) => DOCKER_VM.test(r.command)).reduce((a, r) => a + used(r), 0) / seconds
  const dockerSteps = [...tracked].filter(([, t]) => t.docker).length
  for (const [id, t] of tracked) {
    const tree = ownTree(rows, t.pid)
    let cores = rows.filter((r) => tree.has(r.pid)).reduce((a, r) => a + used(r), 0) / seconds
    if (t.docker && dockerSteps) cores += docker / dockerSteps
    out.set(id, cores)
  }
  return out
}

/** Reads every `everyMs` while steps run; `result(id)` is a step's mean and peak processors: { cores, peak }. */
export class CpuMeter {
  constructor({ read = readCpu, everyMs = 5000, now = () => Date.now() } = {}) {
    Object.assign(this, { read, everyMs, now, tracked: new Map(), sums: new Map(), timer: null, last: null })
  }

  track(id, pid, { docker = false } = {}) {
    this.tracked.set(id, { pid, docker })
    this.sums.set(id, { total: 0, n: 0, peak: 0 })
  }

  untrack(id) {
    this.tracked.delete(id)
  }

  sample() {
    const rows = this.read()
    const at = this.now()
    if (this.last && this.tracked.size) {
      for (const [id, cores] of cpuByStep(rows, this.tracked, this.last.byPid, (at - this.last.at) / 1000)) {
        const s = this.sums.get(id)
        s.total += cores
        s.n += 1
        s.peak = Math.max(s.peak, cores)
      }
    }
    this.last = { at, byPid: new Map(rows.map((r) => [r.pid, r.cpu])) }
  }

  result(id) {
    const s = this.sums.get(id)
    if (!s?.n) return null
    return { cores: Math.round((s.total / s.n) * 10) / 10, peak: Math.round(s.peak * 10) / 10 }
  }

  start() {
    this.sample()
    this.timer = setInterval(() => this.sample(), this.everyMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
  }
}
