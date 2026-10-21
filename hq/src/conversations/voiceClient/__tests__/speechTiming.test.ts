import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSpeechTrace } from '../speechTiming'

type Line = { at: number; msg?: unknown; sent?: string }

function recording(name: string): Line[] {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Line)
}

/** Replays a recording: audio streamed in real time, 100 ms a chunk, from when the socket opened until Terminate. */
function replay(name: string) {
  const lines = recording(name)
  let clock = 0
  const trace = createSpeechTrace(() => clock)
  const open = lines.find(l => l.sent === 'socket open')!.at
  const end = lines.find(l => l.sent === 'Terminate')!.at
  trace.mark('socket open', open)
  for (let t = open + 100; t <= end; t += 100) { clock = t; trace.sent(100, t, t < 12_000 ? 0.1 : 0.01) }
  for (const l of lines) if (l.msg) trace.message(JSON.stringify(l.msg), l.at)
  return trace
}

describe('dictation timing @SC-1003', () => {
  it('traces a word back to when it was captured', () => {
    let clock = 1000
    const trace = createSpeechTrace(() => clock)
    trace.mark('socket open')
    for (let i = 1; i <= 5; i++) { clock = 1000 + i * 100; trace.sent(100, clock, 0.1) }
    // 250 ms into the stream was captured in the third chunk, which ended at 1300.
    expect(trace.capturedAt(250)).toBe(1250)
  })

  it('measures the lag of words shown behind speech, from a recording of the service', () => {
    const report = replay('assemblyai-pauses.jsonl').report()
    expect(report.partialLag.count).toBeGreaterThan(0)
    expect(report.finalLag.count).toBe(3)
    // The first partial ("So it started", ending 799 ms into the stream) came 521 ms after it was spoken.
    expect(report.lines.find(l => l.includes('So it started'))).toContain('lag 521 ms')
    expect(report.lines.join('\n')).toMatch(/partial lag .* median \d+ ms/)
  })

  it('keeps each message’s lag across a change of socket', () => {
    let clock = 0
    const trace = createSpeechTrace(() => clock)
    trace.mark('socket open')
    for (let i = 1; i <= 20; i++) { clock = i * 100; trace.sent(100, clock, 0.1) }
    // A word ending 1500 ms into the first socket's stream was captured at 1500; it arrives at 2300.
    clock = 2300
    trace.message(JSON.stringify({ type: 'Turn', turn_order: 0, end_of_turn: true, transcript: 'Book it.', words: [{ end: 1500 }] }))
    trace.mark('socket open')
    for (let i = 1; i <= 5; i++) { clock = 2300 + i * 100; trace.sent(100, clock, 0.1) }
    const lines = trace.report().lines.join('\n')
    expect(lines).toContain('Dictation timing')
    expect(lines).toContain('sockets: 2 opened')
    expect(lines).toMatch(/socket 1 turn 0 final +lag 800 ms/)
  })
})
