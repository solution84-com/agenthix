// @vitest-environment jsdom
/** The editor is the skill's page ready to write in (board *The editor*): one view, a Changes switch, problems at their line. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EditorView } from '../editorTypes'
import type { EditorApi } from '../useEditorApi'
import { base64OfBytes, bytesOfText } from '../editorFiles'

vi.mock('../AskAgentBox', () => ({ AskAgentBox: () => null }))
vi.mock('../PublishDialog', () => ({ PublishDialog: () => null }))

import { SkillEditor } from '../SkillEditor'

const file = (path: string, text: string) => ({ path, base64: base64OfBytes(bytesOfText(text)) })
const BASE = '---\nname: notes\ndescription: Writes notes.\n---\n# notes\n\nCollect the changes.\n'
const DRAFT = '---\nname: notes\ndescription: Writes notes.\n---\n# notes\n\nCollect the changes, by area.\nRun scripts/format.pyx on the notes.\n'

const view = (files: { path: string; base64: string }[]): EditorView => ({
  target: { kind: 'library', assetId: 'a1' }, name: 'notes', identity: 'org/notes', where: 'Library', revision: 3,
  files, base: [file('SKILL.md', BASE), file('scripts/format.py', 'print(1)\n')], baseLabel: 'version 1.1.0, in use', inUse: '1.1.0',
  draftBy: 'Ada', revisions: [], editsHere: true, notEditableReason: null, mayPublish: true,
  nextVersions: { patch: '1.1.1', minor: '1.2.0', major: '2.0.0' }, nextNumber: null, agentsWith: { everyAgent: false, names: [] }, warnings: [],
})

const api = { save: vi.fn(), discard: vi.fn(), publish: vi.fn() } as unknown as EditorApi

afterEach(cleanup)

describe('the editor @SC-1626', () => {
  it('has one view, no View, Edit or Changes tabs, and SKILL.md’s name and description as two fields', () => {
    render(<SkillEditor view={view([file('SKILL.md', DRAFT), file('scripts/format.py', 'print(1)\n')])} api={api} reload={async () => undefined} onDiscarded={vi.fn()} />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('notes')
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Writes notes.')
    expect(screen.queryByTestId('version-on-publish')).toBeNull()
    expect(screen.getByTestId('editor-subline').textContent).toContain('changes 1 file from version 1.1.0, in use')
  })

  it('shows a problem at its line and says what Publish waits for', () => {
    const { container } = render(<SkillEditor view={view([file('SKILL.md', DRAFT), file('scripts/format.py', 'print(1)\n')])} api={api} reload={async () => undefined} onDiscarded={vi.fn()} />)
    const publish = screen.getByRole('button', { name: 'Publish…' })
    expect(publish.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(publish)
    expect(screen.getByTestId('tooltip').textContent).toContain('Publish waits for 1 problem in SKILL.md, line 8.')
    fireEvent.click(publish)
    expect(screen.getByRole('button', { name: 'Show it' })).toBeTruthy()
    expect(screen.queryByTestId('publish-why')).toBeNull()
    expect(container.querySelector('.cm-problem')?.textContent).toContain('names scripts/format.pyx, which isn’t in the skill')
    expect(screen.getByTestId('checks-line').textContent).toBe('✕ 1 problem · ✓ 1 check passes')
    expect(container.querySelectorAll('.cm-change-mark').length).toBeGreaterThan(0)
  })

  it('the Changes switch shows the draft’s changes in place, with Undo this file’s changes', () => {
    render(<SkillEditor view={view([file('SKILL.md', DRAFT), file('scripts/format.py', 'print(1)\n')])} api={api} reload={async () => undefined} onDiscarded={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }))
    expect(screen.getByTestId('changed-file').textContent).toContain('against version 1.1.0, in use')
    expect(screen.getByTestId('change-stepper').textContent).toContain('1 of 1 change')
    fireEvent.click(screen.getByRole('button', { name: 'Undo this file’s changes' }))
    expect(screen.getByTestId('editor-changes').textContent).toContain('SKILL.md is the same as in version 1.1.0, in use')
  })

  it('keeps Discard draft in ⋯', () => {
    render(<SkillEditor view={view([file('SKILL.md', DRAFT), file('scripts/format.py', 'print(1)\n')])} api={api} reload={async () => undefined} onDiscarded={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^More about the draft/ }))
    expect(screen.getByRole('menuitem', { name: /Discard draft/ })).toBeTruthy()
  })
})
