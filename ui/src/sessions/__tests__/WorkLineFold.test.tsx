import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { workLine } from '@agenthix/core'
import { WorkSteps } from '../WorkLineFold'

afterEach(cleanup)

const at = '2026-10-28T10:00:00.000Z'
const skillCall = { role: 'TOOL' as const, content: '', toolName: 'Skill', toolInput: { skill: 'agenthix:org-code-review' }, toolOutput: 'Launching skill: org-code-review', createdAt: at }
const steps = workLine([skillCall]).steps

describe("a used skill's step (skills spec part 5, Seeing it used) @SC-1658", () => {
  it('reads as hq names it for this run, when it does', () => {
    const asked: Array<[string, string | null]> = []
    render(<WorkSteps steps={steps} runId="r1" actions={{
      skillLabel: (name, runId) => { asked.push([name, runId]); return 'Used the skill Code review · Fernhill · 1.3.0' },
    }} />)
    expect(screen.getByText('Used the skill Code review · Fernhill · 1.3.0')).toBeTruthy()
    expect(asked).toEqual([['org-code-review', 'r1']])
  })

  it('keeps the staged name when hq names nothing, or no one asks', () => {
    render(<WorkSteps steps={steps} runId="r1" actions={{ skillLabel: () => null }} />)
    expect(screen.queryByText(/Used the skill Code review/)).toBeNull()
    expect(document.body.textContent).toContain('org-code-review')
  })

  it('names the run it is of even when its link is hidden', () => {
    const asked: Array<string | null> = []
    render(<WorkSteps steps={steps} runId={null} forRun="r2" actions={{ skillLabel: (_n, runId) => { asked.push(runId); return null } }} />)
    expect(asked).toEqual(['r2'])
  })
})
