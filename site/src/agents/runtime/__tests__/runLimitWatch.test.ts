import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startRunLimitWatch } from '../runLimitWatch'

const limits = { timeLimitMinutes: 30, turnLimit: 3 }

describe('startRunLimitWatch', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stops the run, once, when the time limit passes', () => {
    const onLimit = vi.fn()
    startRunLimitWatch(limits, 'person', onLimit)
    vi.advanceTimersByTime(30 * 60_000 - 1)
    expect(onLimit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    vi.advanceTimersByTime(60 * 60_000)
    expect(onLimit).toHaveBeenCalledTimes(1)
    expect(onLimit).toHaveBeenCalledWith('time', limits)
  })

  it('does not stop a run that ended: stop() clears the timer', () => {
    const onLimit = vi.fn()
    startRunLimitWatch(limits, 'pulse', onLimit).stop()
    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(onLimit).not.toHaveBeenCalled()
  })

  it('stops an unattended run only once it goes past its turn limit', () => {
    const onLimit = vi.fn()
    const watch = startRunLimitWatch(limits, 'schedule', onLimit)
    watch.roundTrip(); watch.roundTrip(); watch.roundTrip()
    expect(onLimit).not.toHaveBeenCalled()
    watch.roundTrip()
    watch.roundTrip()
    expect(onLimit).toHaveBeenCalledTimes(1)
    expect(onLimit).toHaveBeenCalledWith('turns', limits)
  })

  it('applies the turn limit to a run an agent started with run_task — it is never the person\'s (adr-0091)', () => {
    const onLimit = vi.fn()
    const watch = startRunLimitWatch(limits, 'agent', onLimit)
    for (let i = 0; i < 4; i++) watch.roundTrip()
    expect(onLimit).toHaveBeenCalledWith('turns', limits)
  })

  it('never applies the turn limit to a run a person started, or one with no recorded starter', () => {
    const onLimit = vi.fn()
    for (const startedBy of ['person', undefined] as const) {
      const watch = startRunLimitWatch(limits, startedBy, onLimit)
      for (let i = 0; i < 50; i++) watch.roundTrip()
      watch.stop()
    }
    expect(onLimit).not.toHaveBeenCalled()
  })
})
