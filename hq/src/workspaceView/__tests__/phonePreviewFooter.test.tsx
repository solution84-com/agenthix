// @vitest-environment jsdom
/** The line under a running live preview on a phone while its agent works (board `narrow-phone`). */
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PhoneFrame } from '../components/PhoneFrame'
import type { FrameParts } from '../components/WorkspaceFrame'

afterEach(cleanup)

function parts(over: Partial<FrameParts>): FrameParts {
  const top = {
    crumbs: [], next: null, footNext: null, onAbout: () => {}, phoneLine: { text: 'login-page', readOnly: false, opens: 'branches' },
    branchList: () => null, versionList: () => null, openChat: null, note: null, dialogs: null,
  }
  return {
    back: { href: '/projects/SHOP', label: 'Fernhill Shop' }, workspaceName: 'shop-app', workspaces: [],
    section: 'preview', onSection: () => {}, left: null, filesBody: null, git: true,
    middle: () => null, middleShown: false, preview: () => <div>the app</div>,
    previewState: 'running', working: 'Kernel', top, notice: null, onDismissNotice: () => {},
    ...over,
  } as FrameParts
}

const show = (over: Partial<FrameParts>) => render(<MemoryRouter><PhoneFrame {...parts(over)} /></MemoryRouter>)

withFeature('livePreview', () => {
describe('the phone\'s live preview footer @SC-1697', () => {
  it('says the agent is working and the app reloads when it saves', () => {
    show({})
    expect(screen.getByTestId('phone-preview-footer').textContent).toBe('Kernel is working · reloads when it saves')
  })

  it('says nothing while the agent is idle, or with no live preview running', () => {
    show({ working: null })
    expect(screen.queryByTestId('phone-preview-footer')).toBeNull()
    cleanup()
    show({ previewState: 'stopped' })
    expect(screen.queryByTestId('phone-preview-footer')).toBeNull()
  })
})
})
