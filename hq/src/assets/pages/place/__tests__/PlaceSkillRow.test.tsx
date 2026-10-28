// @vitest-environment jsdom
/** A place skill's row: its words, what it is waiting for, and only the controls the person may use. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PlaceSkillRow, type RowHandlers } from '../PlaceSkillRow'
import { MAY_ALL, MAY_NONE, skill } from './fixtures'

afterEach(cleanup)

const handlers = (): RowHandlers => ({
  onSwitch: vi.fn(), onRead: vi.fn(), onChanges: vi.fn(), onPublish: vi.fn(), onPutBack: vi.fn(), onHistory: vi.fn(), onRemove: vi.fn(), onUpdate: vi.fn(),
})
const draw = (s = skill(), may = MAY_ALL, h = handlers()) => {
  render(<MemoryRouter><PlaceSkillRow skill={s} may={may} busy={false} handlers={h} /></MemoryRouter>)
  return h
}

describe('PlaceSkillRow @SC-1642 @SC-1644 @SC-1645 @SC-1646 @SC-1647', () => {
  it('says which Library skill it was added from and offers the newer version to whoever publishes here (F3)', () => {
    const added = skill({ version: 2, origin: { identity: 'agenthix/pm-sprint-planning', version: '1.3.0' }, libraryUpdate: '1.4.0' })
    const h = draw(added)
    expect(screen.getByTestId('place-skill-words').textContent).toBe('version 2 · based on agenthix/pm-sprint-planning 1.3.0 · 1.4.0 available')
    fireEvent.click(screen.getByRole('button', { name: 'Update…' }))
    expect(h.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
    cleanup()
    draw(added, { ...MAY_ALL, publish: false })
    expect(screen.queryByRole('button', { name: 'Update…' })).toBeNull()
  })

  it('shows the name, version and an on switch', () => {
    draw()
    expect(screen.getByText('release-checklist')).toBeTruthy()
    expect(screen.getByTestId('place-skill-words').textContent).toBe('version 3')
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('asks to switch on, naming the skill, and switching off goes straight through', () => {
    const h = draw(skill({ state: 'off', switchHolds: false, switch: null }))
    fireEvent.click(screen.getByRole('switch'))
    expect(h.onSwitch).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), true)
  })

  it('offers to publish a skill found in files, with its version, and to read it', () => {
    const h = draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }))
    expect(screen.getByTestId('place-skill-words').textContent).toBe('in files, not published · off')
    fireEvent.click(screen.getByRole('button', { name: 'Publish as version 1' }))
    expect(h.onPublish).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(h.onRead).toHaveBeenCalled()
  })

  it('a changed skill offers what changed, publishing the next version and putting back the last', () => {
    draw(skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false }))
    expect(screen.getByRole('button', { name: 'What changed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish as version 5' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Put back version 4' })).toBeTruthy()
  })

  it('a viewer sees the skill and no control', () => {
    draw(skill(), MAY_NONE)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('a set-aside skill says why and cannot be switched', () => {
    draw(skill({ setAsideReason: 'The organisation installs agenthix/code-review 1.4.', state: 'off' }))
    expect(screen.getByTestId('place-skill-note').textContent).toMatch(/organisation installs/)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('a repository skill switches and nothing else', () => {
    draw(skill({ group: 'WORKSPACE', workspaceId: 'w1', path: 'workspace/w1/.claude/skills/deploy-preview', status: 'unpublished', version: null, newestVersion: null }))
    expect(screen.getByText(/from \.claude\/skills/)).toBeTruthy()
    expect(screen.getByRole('switch')).toBeTruthy()
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
  })

  it('says why a switch went off: its files changed since a person switched it on (finding 16)', () => {
    const when = new Date('2026-10-27T10:00:00Z')
    draw(skill({ status: 'changed', version: null, newestVersion: 1, state: 'off', switch: 'ON', switchHolds: false, switchedBy: 'Sam Rivera', switchedAt: when }))
    expect(screen.getByTestId('place-skill-switched-off').textContent).toBe(`Switched off: its files changed since Sam Rivera switched it on, ${when.toLocaleDateString()}.`)
    expect(screen.getByRole('button', { name: 'What changed' })).toBeTruthy()
  })

  it('says it for a skill never published too, and offers What changed', () => {
    const h = draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: 'ON', switchHolds: false, switchedBy: null, switchedAt: null }))
    expect(screen.getByTestId('place-skill-switched-off').textContent).toBe('Switched off: its files changed since someone switched it on.')
    fireEvent.click(screen.getByRole('button', { name: 'What changed' }))
    expect(h.onChanges).toHaveBeenCalled()
  })

  it('says nothing of a switch for a skill nobody switched on, or whose switch holds', () => {
    draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }))
    expect(screen.queryByTestId('place-skill-switched-off')).toBeNull()
    cleanup()
    draw()
    expect(screen.queryByTestId('place-skill-switched-off')).toBeNull()
  })

  it('keeps the text apart from the actions: the switch beside it, the actions under it', () => {
    draw(skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false, origin: { identity: 'a/b', version: '1' }, libraryUpdate: '2' }))
    const actions = screen.getByTestId('place-skill-actions')
    expect(actions.contains(screen.getByRole('button', { name: 'Publish as version 5' }))).toBe(true)
    expect(actions.contains(screen.getByRole('switch'))).toBe(false)
    expect(screen.getByTestId('place-skill-words').closest('[data-testid="place-skill-actions"]')).toBeNull()
  })
})
