// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ToolTask } from '@agenthix/ui/tasks'
import { overviewWork, firstLine, OVERVIEW_ROWS } from '../overviewWork'
import { ProjectWork } from '../ProjectWork'

const NOW = new Date('2030-01-10T12:00:00Z')
let n = 0
function task(patch: Partial<ToolTask>): ToolTask {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', state: 'TODO', runState: 'RUN_NONE', runStateReason: null,
    agent: null, columnLabel: null, project: { id: 'p1', key: 'WEB', name: 'Web' },
    waitsForAgent: false, startsAt: null, workingSince: null, doneAt: null, result: null, createdAt: `2030-01-0${(n % 9) + 1}T00:00:00Z`, ...patch,
  }
}

describe('a member\'s work on the overview @SC-2116', () => {
  const tasks = [
    task({ runState: 'RUN_BLOCKED' }),
    task({ runState: 'RUN_FAILED', runStateReason: 'Build failed' }),
    task({ runState: 'RUN_ACTIVE', workingSince: '2030-01-10T11:59:00Z' }),
    ...Array.from({ length: 5 }, () => task({})),
    task({ state: 'DONE', doneAt: '2030-01-09T10:00:00Z', result: '## Nine pages, grouped under Work.\n\nMore.' }),
    task({ state: 'DONE', doneAt: '2029-01-09T10:00:00Z', result: 'Too old' }),
  ]
  const work = overviewWork(tasks, NOW)

  it('groups what needs the person, what runs, what is next and what finished, with a next step for each need', () => {
    expect(work.needsYou.map(r => r.action).sort()).toEqual(['review', 'runAgain'])
    expect(work.running).toHaveLength(1)
    expect(work.upNext).toHaveLength(OVERVIEW_ROWS)
    expect(work.upNextTotal).toBe(5)
    expect(work.finished).toHaveLength(1)
    expect(work.finished[0].result).toBe('Nine pages, grouped under Work.')
    expect(work.total).toBe(tasks.length)
  })

  it('draws the lists with a way to all the tasks', () => {
    render(<MemoryRouter><ProjectWork work={work} base="/projects/WEB" /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /Needs you/ })).toBeTruthy()
    expect(screen.getByText('Recently finished')).toBeTruthy()
    expect(screen.getByText(/Nine pages, grouped under Work\./)).toBeTruthy()
    const all = screen.getByText(`All ${tasks.length} tasks →`)
    expect(all.getAttribute('href')).toBe('/projects/WEB?tool=tasks')
  })

  it('opens a task in the Tasks section of the place it is drawn in, Your space included', () => {
    render(<MemoryRouter><ProjectWork work={work} base="/space" /></MemoryRouter>)
    const row = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.includes('task='))!
    expect(row.getAttribute('href')).toMatch(/^\/space\?tool=tasks&task=/)
  })
})

describe('firstLine', () => {
  it('skips blank lines and Markdown marks, and is null for no text', () => {
    expect(firstLine('\n\n# Title here\nbody')).toBe('Title here')
    expect(firstLine(null)).toBeNull()
    expect(firstLine('  \n')).toBeNull()
  })
})
