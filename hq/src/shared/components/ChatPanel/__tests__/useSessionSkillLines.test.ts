// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ data: undefined as unknown, refetch: vi.fn(), asked: [] as unknown[] }))
vi.mock('wasp/client/operations', () => ({
  getSessionSkillSteps: 'getSessionSkillSteps',
  useQuery: (_op: string, args: unknown) => { h.asked.push(args); return { data: h.data, refetch: h.refetch } },
}))

import { useSessionSkillLines } from '../useSessionSkillLines'

beforeEach(() => {
  vi.useFakeTimers()
  h.refetch.mockReset()
  h.asked = []
  h.data = { runs: { r1: { 'org-review': 'Used the skill Review · Fernhill · 1.0.0' }, r2: {} }, latestRunId: 'r2' }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("a used skill's line in a session's work (skills spec part 5) @M6", () => {
  it("reads hq's line for the run, by the staged name, and the newest run's for a live line", () => {
    const { result } = renderHook(() => useSessionSkillLines('s1'))
    expect(h.asked[0]).toEqual({ sessionId: 's1' })
    expect(result.current('org-review', 'r1')).toBe('Used the skill Review · Fernhill · 1.0.0')
    expect(result.current('org-review', 'r2')).toBeNull()
    h.data = { runs: { r1: { 'org-review': 'x' } }, latestRunId: 'r1' }
    const live = renderHook(() => useSessionSkillLines('s1'))
    expect(live.result.current('org-review', null)).toBe('x')
  })

  it('asks hq again once for a step it has not named, never in a loop', () => {
    const { result, rerender } = renderHook(() => useSessionSkillLines('s1'))
    result.current('person-notes', 'r2')
    rerender()
    vi.advanceTimersByTime(10_000)
    result.current('person-notes', 'r2')
    rerender()
    vi.advanceTimersByTime(10_000)
    expect(h.refetch).toHaveBeenCalledTimes(1)
  })
})
