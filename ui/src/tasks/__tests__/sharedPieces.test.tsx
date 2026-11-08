import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EXECUTION_STATES } from '@agenthix/core'
import { RunAvatar, runAvatarWords } from '../RunAvatar'
import { TaskTypeMark, taskTypeIconName } from '../TaskTypeMark'
import { AgentAvatar } from '../../sessions/SessionComponents'

const avatar = <AgentAvatar name="Writer" size="sm" />

describe('the avatar ring (D18)', () => {
  it('draws a ring only for Waiting, Running, Needs you and Failed', () => {
    const ringed = EXECUTION_STATES.filter(state => {
      const { container, unmount } = render(<RunAvatar name="Writer" state={state}>{avatar}</RunAvatar>)
      const has = !!container.querySelector('[data-testid="run-ring"]')
      unmount()
      return has
    })
    expect(ringed).toEqual(['WAITING', 'RUNNING', 'NEEDS_YOU', 'FAILED'])
  })

  it('marks Needs you with a dot and Failed with a !', () => {
    const { container, rerender } = render(<RunAvatar name="Writer" state="NEEDS_YOU">{avatar}</RunAvatar>)
    expect(container.querySelector('[data-testid="run-mark"]')?.textContent).toBe('')
    rerender(<RunAvatar name="Writer" state="FAILED">{avatar}</RunAvatar>)
    expect(container.querySelector('[data-testid="run-mark"]')?.textContent).toBe('!')
    rerender(<RunAvatar name="Writer" state="RUNNING">{avatar}</RunAvatar>)
    expect(container.querySelector('[data-testid="run-mark"]')).toBeNull()
  })

  it('turns only while running, and not when motion is reduced', () => {
    const { container } = render(<RunAvatar name="Writer" state="RUNNING">{avatar}</RunAvatar>)
    const ring = container.querySelector('[data-testid="run-ring"]')!
    expect(ring.className).toContain('animate-run-turn')
    expect(ring.className).toContain('motion-reduce:animate-none')
  })

  it('says who and what in words, on hover and to a screen reader', () => {
    render(<RunAvatar name="Writer" state="RUNNING" detail="1 min · writing the fix">{avatar}</RunAvatar>)
    const img = screen.getByRole('img', { name: 'Writer · Running · 1 min · writing the fix' })
    expect(img.getAttribute('title')).toBe('Writer · Running · 1 min · writing the fix')
    expect(runAvatarWords('Kai', null)).toBe('Kai')
    expect(runAvatarWords('Kai', 'FINISHED')).toBe('Kai · Finished')
  })

  it('holds a person as well as an agent', () => {
    render(<RunAvatar name="Sam Okafor" state="WAITING"><span data-testid="person">S</span></RunAvatar>)
    expect(screen.getByRole('img', { name: 'Sam Okafor · Waiting' }).contains(screen.getByTestId('person'))).toBe(true)
  })
})

describe('a task type mark', () => {
  it('draws the built-in Task and Epic and the known custom icons, and the task icon for a name it does not know', () => {
    expect(taskTypeIconName('task')).toBe('task')
    expect(taskTypeIconName('epic')).toBe('epic')
    expect(taskTypeIconName('bug')).toBe('bug')
    expect(taskTypeIconName('no-such-icon')).toBe('task')
  })

  it('is named by its type, so a mark alone still reads', () => {
    render(<TaskTypeMark type={{ name: 'Feature request', icon: 'feature' }} />)
    const mark = screen.getByRole('img', { name: 'Feature request' })
    expect(mark.getAttribute('data-icon')).toBe('feature')
    expect(mark.getAttribute('title')).toBe('Feature request')
  })

  it('draws as a tile in a list of types', () => {
    render(<TaskTypeMark type={{ name: 'Bug', icon: 'bug' }} variant="tile" />)
    expect(screen.getByRole('img', { name: 'Bug' }).className).toContain('bg-surface-2')
  })
})
