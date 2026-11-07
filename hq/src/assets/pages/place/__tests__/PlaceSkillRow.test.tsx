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

const words = () => screen.getByTestId('place-skill-words').textContent
const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name: `More about ${name}` }))

describe('PlaceSkillRow @SC-1642 @SC-1644 @SC-1645 @SC-1646 @SC-1647', () => {
  it('says a copy from the Library is one, and offers Update… when a newer one exists (F3)', () => {
    const added = skill({ version: 2, origin: { identity: 'agenthix/pm-sprint-planning', version: '1.3.0' }, libraryUpdate: '1.4.0' })
    const h = draw(added)
    expect(words()).toBe('A copy of agenthix/pm-sprint-planning 1.3.0 from the Library · on for every agent here · 1.4.0 available')
    fireEvent.click(screen.getByRole('button', { name: 'Update…' }))
    expect(h.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
    cleanup()
    draw(added, { ...MAY_ALL, publish: false })
    expect(screen.queryByRole('button', { name: 'Update…' })).toBeNull()
  })

  it('a copy with no newer one says it stays at its version and offers no action', () => {
    draw(skill({ origin: { identity: 'a/b', version: '1.1.0' } }))
    expect(words()).toBe('A copy of a/b 1.1.0 from the Library · on for every agent here · stays at this version')
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['More about release-checklist'])
    expect(screen.getByRole('switch')).toBeTruthy()
  })

  it('shows the name, its version in words and an on switch', () => {
    draw()
    expect(screen.getByText('release-checklist')).toBeTruthy()
    expect(words()).toBe('Version 3 · on for every agent here')
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('asks to switch on, naming the skill, and switching off goes straight through', () => {
    const h = draw(skill({ state: 'off', switchHolds: false, switch: null }))
    fireEvent.click(screen.getByRole('switch'))
    expect(h.onSwitch).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), true)
  })

  it('a skill found in files says it is off until published, and its one action is Publish…', () => {
    const h = draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }))
    expect(words()).toBe("Found in this place's files · off until you publish it")
    fireEvent.click(screen.getByRole('button', { name: 'Publish…' }))
    expect(h.onPublish).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'See the change' })).toBeNull()
    openMenu('release-checklist')
    expect(screen.getByRole('menuitem', { name: /Read the files/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Publish/ })).toBeNull()
  })

  it('a changed skill has one action, See the change, and keeps Publish…, Put back, Edit, Versions and Remove in ⋯', () => {
    const h = draw(skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false }))
    expect(words()).toBe('Its files changed · off until you look at the change')
    expect(screen.queryByRole('button', { name: 'Publish…' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See the change' }))
    expect(h.onChanges).toHaveBeenCalled()
    openMenu('release-checklist')
    const items = screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent)
    expect(items).toEqual(['Publish…', 'Put back version 4', 'Edit', 'Versions', 'Remove'])
    fireEvent.click(screen.getByRole('menuitem', { name: /^Publish…/ }))
    expect(h.onPublish).toHaveBeenCalled()
  })

  it('Versions and Remove in ⋯ reach the history and the removal', () => {
    const h = draw()
    openMenu('release-checklist')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Versions/ }))
    expect(h.onHistory).toHaveBeenCalled()
    openMenu('release-checklist')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Remove/ }))
    expect(h.onRemove).toHaveBeenCalled()
  })

  it('a viewer sees the skill and no switch or publish, and only its versions in ⋯', () => {
    draw(skill(), MAY_NONE)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    openMenu('release-checklist')
    expect(screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent)).toEqual(['Versions'])
    expect(words()).toBe('Version 3 · on for every agent here')
  })

  it('a viewer of an unpublished skill can read it', () => {
    const h = draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }), MAY_NONE)
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(h.onRead).toHaveBeenCalled()
  })

  it('a set-aside skill says why and cannot be switched', () => {
    draw(skill({ setAsideReason: 'The organisation installs agenthix/code-review 1.4.', state: 'off' }))
    expect(screen.getByTestId('place-skill-note').textContent).toMatch(/organisation installs/)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('a repository skill switches and nothing else', () => {
    draw(skill({ group: 'WORKSPACE', workspaceId: 'w1', path: 'workspace/w1/.claude/skills/deploy-preview', status: 'unpublished', version: null, newestVersion: null }))
    expect(words()).toBe("Found in the repository's .claude/skills · read-only · on")
    expect(screen.getByRole('switch')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Publish|Edit/ })).toBeNull()
  })

  it('says why a switch went off: its files changed since a person switched it on (finding 16)', () => {
    const when = new Date('2026-10-27T10:00:00Z')
    draw(skill({ status: 'changed', version: null, newestVersion: 1, state: 'off', switch: 'ON', switchHolds: false, switchedBy: 'Sam Rivera', switchedAt: when }))
    expect(screen.getByTestId('place-skill-switched-off').textContent).toBe(`Switched off: its files changed since Sam Rivera switched it on, ${when.toLocaleDateString()}.`)
    expect(screen.getByRole('button', { name: 'See the change' })).toBeTruthy()
  })

  it('says it for a skill never published too, and offers See the change', () => {
    const h = draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: 'ON', switchHolds: false, switchedBy: null, switchedAt: null }))
    expect(screen.getByTestId('place-skill-switched-off').textContent).toBe('Switched off: its files changed since someone switched it on.')
    fireEvent.click(screen.getByRole('button', { name: 'See the change' }))
    expect(h.onChanges).toHaveBeenCalled()
  })

  it('says nothing of a switch for a skill nobody switched on, or whose switch holds', () => {
    draw(skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false }))
    expect(screen.queryByTestId('place-skill-switched-off')).toBeNull()
    cleanup()
    draw()
    expect(screen.queryByTestId('place-skill-switched-off')).toBeNull()
  })

  it('never offers more than one action beside the switch', () => {
    draw(skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false, origin: { identity: 'a/b', version: '1' }, libraryUpdate: '2' }))
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(labels).toEqual(['See the change', 'More about release-checklist'])
    expect(screen.getByRole('switch')).toBeTruthy()
  })
})
