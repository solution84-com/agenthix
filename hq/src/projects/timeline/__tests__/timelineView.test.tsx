// @vitest-environment jsdom
/** The timeline on screen (spec §3): a drag changes the plan alone, ▶ the start time alone, and a narrow width is an agenda. */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { Timeline, DAY_MS, PX_PER_DAY, STEP_DAYS, chartView, scrollToDay, todayUtc, type TimelineProps } from '@agenthix/ui/timeline'
import { NOW, data, epic, task } from './fixtures'

const WIDE = 2100
/**
 * The chart is as wide as the dates it covers; the mock makes a day 100px on the Week scale, so a drag of 100px is a day.
 * Everything but the chart's track reports the viewport's width.
 */
function trackWidth(viewport: number, track = viewport) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const w = this.getAttribute('data-testid') === 'timeline-track' ? track : viewport
    return { width: w, height: 0, top: 0, left: 0, right: w, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
  })
}
const weekView = () => chartView('week', null, todayUtc(NOW), WIDE)
function wideGrid() {
  const v = weekView()
  trackWidth(WIDE, ((v.to - v.from) / DAY_MS) * 100)
}
const pointer = (target: Element | Window, type: string, clientX: number) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 })) })
function drag(el: Element, dxPx: number) {
  pointer(el, 'pointerdown', 500)
  pointer(window, 'pointermove', 500 + dxPx)
  pointer(window, 'pointerup', 500 + dxPx)
}

function setup(over: Partial<TimelineProps> = {}) {
  const props: TimelineProps = {
    scale: 'week', show: 'tasks', now: NOW, data: data(),
    onScale: vi.fn(), onShow: vi.fn(), onOpenTask: vi.fn(), onChangePlan: vi.fn(), onChangeStartTime: vi.fn(),
    chooseBoards: true, ...over,
  }
  render(<Timeline {...props} />)
  return props
}

beforeEach(() => wideGrid())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('bars @SC-566', () => {
  const t = task({ id: 'a', key: 'WEB-9', title: 'Pricing table', planStart: '2026-10-05', planFinish: '2026-10-07', startAt: '2026-10-09T09:00:00Z' })

  it('labels a bar by its title, never its key, and shows ▶, a lane\'s Backlog count and today', () => {
    setup({ data: data({ tasks: [t] }) })
    expect(screen.getAllByText('Pricing table').length).toBeGreaterThan(0)
    expect(screen.queryByText(/WEB-9/)).toBeNull()
    expect(screen.getByTestId('play-a').textContent).toBe('▶')
    expect(screen.getByText('Backlog 3')).toBeTruthy()
    expect(screen.getByTestId('today-line')).toBeTruthy()
  })

  it('draws a run as a darker slice, and outlines a task that needs you', () => {
    const needs = { ...t, needsYou: true, runState: 'RUN_BLOCKED' }
    setup({ data: data({ tasks: [needs], runs: { slices: [{ runId: 'r1', taskId: 'a', status: 'COMPLETED', start: '2026-10-06T09:00:00Z', end: '2026-10-06T12:00:00Z' }], unavailable: null, truncated: false } }) })
    expect(screen.getAllByTestId('slice')).toHaveLength(1)
    expect(screen.getByTestId('bar-a').className).toContain('ring-warning')
  })

  it('draws a run outside its task\'s plan outside the bar, not clipped', () => {
    const slice = { runId: 'r1', taskId: 'a', status: 'COMPLETED', start: '2026-10-12T09:00:00Z', end: '2026-10-12T17:00:00Z' }
    setup({ data: data({ tasks: [t], runs: { slices: [slice], unavailable: null, truncated: false } }) })
    const bar = screen.getByTestId('bar-a')
    const drawn = screen.getByTestId('slice')
    expect(bar.contains(drawn)).toBe(false)
    expect(parseFloat(drawn.style.left)).toBeGreaterThan(parseFloat(bar.style.left) + parseFloat(bar.style.width))
  })

  it('shows the runs of a task with no plan on its row, with no bar', () => {
    const unplanned = task({ id: 'u', title: 'Unplanned', planStart: null, planFinish: null })
    const slice = { runId: 'r2', taskId: 'u', status: 'COMPLETED', start: '2026-10-07T09:00:00Z', end: '2026-10-07T12:00:00Z' }
    setup({ data: data({ tasks: [unplanned], runs: { slices: [slice], unavailable: null, truncated: false } }) })
    expect(screen.queryByTestId('bar-u')).toBeNull()
    expect(screen.getAllByTestId('slice')).toHaveLength(1)
    expect(screen.getAllByText('Unplanned').length).toBeGreaterThan(0)
  })

  it('opens the task on a click @SC-567', () => {
    const p = setup({ data: data({ tasks: [t] }) })
    fireEvent.click(screen.getByTestId('bar-a'))
    expect(p.onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('does not open the task at the end of a drag @SC-567', () => {
    const p = setup({ data: data({ tasks: [t] }) })
    drag(screen.getByTestId('bar-a'), 100)
    fireEvent.click(screen.getByTestId('bar-a'))
    expect(p.onOpenTask).not.toHaveBeenCalled()
  })
})

describe('dragging @SC-567', () => {
  const t = task({ id: 'a', title: 'Pricing table', planStart: '2026-10-05', planFinish: '2026-10-07', startAt: '2026-10-09T09:00:00Z' })

  it('dragging the bar changes only the plan', () => {
    const p = setup({ data: data({ tasks: [t] }) })
    drag(screen.getByTestId('bar-a'), 200)
    expect(p.onChangePlan).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { planStart: '2026-10-07', planFinish: '2026-10-09' })
    expect(p.onChangeStartTime).not.toHaveBeenCalled()
  })

  it('dragging an end changes only that end of the plan', () => {
    const p = setup({ data: data({ tasks: [t] }) })
    drag(screen.getByTestId('finish-a'), 100)
    expect(p.onChangePlan).toHaveBeenCalledWith(expect.anything(), { planStart: '2026-10-05', planFinish: '2026-10-08' })
    drag(screen.getByTestId('start-a'), -100)
    expect(p.onChangePlan).toHaveBeenLastCalledWith(expect.anything(), { planStart: '2026-10-04', planFinish: '2026-10-07' })
    expect(p.onChangeStartTime).not.toHaveBeenCalled()
  })

  it('dragging ▶ changes only the start time, keeping its time of day', () => {
    const p = setup({ data: data({ tasks: [t] }) })
    drag(screen.getByTestId('play-a'), 100)
    expect(p.onChangeStartTime).toHaveBeenCalledTimes(1)
    expect((p.onChangeStartTime as ReturnType<typeof vi.fn>).mock.calls[0]![1].toISOString()).toBe('2026-10-10T09:00:00.000Z')
    expect(p.onChangePlan).not.toHaveBeenCalled()
  })

  it('does not drag a routine\'s round, or an epic whose span comes from its tasks', () => {
    const round = task({ id: 'r', title: 'Weekly report', planStart: '2026-10-08', planFinish: '2026-10-08', startAt: '2026-10-08T09:00:00Z', routineId: 'rt' })
    const derived = epic({ id: 'e', title: 'Pricing page', span: { start: '2026-10-05', finish: '2026-10-09', fromTasks: true } })
    const p = setup({ data: data({ tasks: [round], epics: [derived] }) })
    drag(screen.getByTestId('play-r'), 100)
    drag(screen.getByTestId('bar-e'), 100)
    expect(p.onChangeStartTime).not.toHaveBeenCalled()
    expect(p.onChangePlan).not.toHaveBeenCalled()
  })

  it('offers no drag at all where the change is not given', () => {
    const p = setup({ data: data({ tasks: [t] }), onChangePlan: undefined, onChangeStartTime: undefined })
    expect(screen.queryByTestId('finish-a')).toBeNull()
    drag(screen.getByTestId('bar-a'), 100)
    drag(screen.getByTestId('play-a'), 100)
    expect(p.onOpenTask).not.toHaveBeenCalled()
  })
})

describe('epics, milestones and the toolbar @SC-566', () => {
  it('marks an epic\'s row with Epic', () => {
    const e = epic({ id: 'e', title: 'Pricing page', planStart: '2026-10-05', planFinish: '2026-10-09' })
    setup({ show: 'epics', data: data({ epics: [e] }) })
    expect(screen.getByText('Epic')).toBeTruthy()
  })

  it('shows a milestone as a flag on its date with its epic under it', () => {
    const e = epic({ id: 'e', title: 'Pricing page', milestoneId: 'm', planStart: '2026-10-05', planFinish: '2026-10-09' })
    setup({ scale: 'quarter', show: 'milestones', data: data({ epics: [e], milestones: [{ id: 'm', name: 'Self-serve live', date: '2026-11-30', epicIds: ['e'] }] }) })
    expect(screen.getByTestId('milestone-m').textContent).toContain('⚑')
    expect(screen.getByTestId('bar-e')).toBeTruthy()
  })

  it('switches Show and the scale, with the tick on the right of the label', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Show: Tasks/ }))
    const tasks = screen.getByRole('menuitemradio', { name: /Tasks/ })
    expect(tasks.textContent).toBe('Tasks✓')
    expect(screen.getByRole('menuitemradio', { name: /Epics/ }).textContent).toBe('Epics')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Epics/ }))
    expect(p.onShow).toHaveBeenCalledWith('epics')
    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }))
    expect(p.onScale).toHaveBeenCalledWith('quarter')
  })

  it('goes back and forward by the scale, and back to today, by scrolling', () => {
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo as never
    setup()
    // It opens scrolled to today.
    const opened = scrollToDay(weekView(), todayUtc(NOW), WIDE)
    expect(screen.getByTestId('timeline-scroller').scrollLeft).toBe(opened)
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: opened + STEP_DAYS.week * PX_PER_DAY.week, behavior: 'smooth' })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: opened - STEP_DAYS.week * PX_PER_DAY.week, behavior: 'smooth' })
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: scrollToDay(weekView(), todayUtc(NOW), WIDE), behavior: 'smooth' })
    delete (Element.prototype as { scrollTo?: unknown }).scrollTo
  })

  it('says when the project reaches further than a timeline can show @SC-568', () => {
    setup({ data: data({ capped: true }) })
    expect(screen.getByText(/400 days around today/)).toBeTruthy()
  })

  it('folds a lane away and chooses which boards show', () => {
    const d = data({
      boards: [
        { id: 'b1', name: 'Project Tasks', kind: 'PROJECT_TASKS', backlogCount: 0, sprints: [] },
        { id: 'b2', name: 'Bugs', kind: 'WORKFLOW', backlogCount: 0, sprints: [] },
      ],
      tasks: [task({ id: 'a', title: 'Fix it', boardId: 'b2', planStart: '2026-10-06', planFinish: '2026-10-06' })],
    })
    const p = setup({ data: d, onToggleBoard: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /Bugs/ }))
    expect(screen.queryByTestId('bar-a')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Boards/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bugs' }))
    expect(p.onToggleBoard).toHaveBeenCalledWith('b2')
  })
})

describe('notices @SC-568', () => {
  it('says quietly when runs could not be read, and when older work is left out', () => {
    setup({ data: data({ runs: { slices: [], unavailable: 'site down', truncated: true } }) })
    expect(screen.getByText(/Runs could not be read from the site/)).toBeTruthy()
    expect(screen.getByText(/Older work in this range is left out/)).toBeTruthy()
  })
})

describe('narrow @SC-569', () => {
  const tasks = [
    task({ title: 'Now', planStart: '2026-10-07', planFinish: '2026-10-09' }),
    task({ title: 'Next', planStart: '2026-10-13', planFinish: '2026-10-13' }),
    task({ title: 'Late', planStart: '2026-11-02', planFinish: '2026-11-03' }),
  ]

  it('is an agenda: This week, Next week, Later, each task with its date', () => {
    trackWidth(400)
    setup({ data: data({ tasks }) })
    for (const [name, title, date] of [['This week', 'Now', 'Wed 7 Oct – Fri 9 Oct'], ['Next week', 'Next', 'Tue 13 Oct'], ['Later', 'Late', 'Mon 2 Nov – Tue 3 Nov']]) {
      const group = within(screen.getByRole('region', { name: name! }))
      expect(group.getByText(title!)).toBeTruthy()
      expect(group.getByText(date!)).toBeTruthy()
    }
    expect(screen.queryByTestId('today-line')).toBeNull()
  })

  it('opens a task from its line', () => {
    trackWidth(400)
    const p = setup({ data: data({ tasks }) })
    fireEvent.click(screen.getByText('Now'))
    expect(p.onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Now' }))
  })

  it('is the grid on a wide surface', () => {
    setup({ data: data({ tasks }) })
    expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()
    expect(screen.getByTestId('today-line')).toBeTruthy()
  })
})
