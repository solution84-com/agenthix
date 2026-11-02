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
  return {
    back: { href: '/projects/SHOP', label: 'Fernhill Shop' }, aboutHref: '/a', workspaceName: 'shop-app', workspaces: [],
    section: 'preview', onSection: () => {}, select: () => null, filesBody: null, gitBody: null, filesNote: '', gitNote: '',
    middle: () => null, middleShown: false, status: null, conversation: <div>thread</div>, preview: () => <div>the app</div>,
    previewState: 'running', branchTitle: 'login-page', activity: { working: true }, agentName: 'Kernel',
    notice: null, onDismissNotice: () => {},
    ...over,
  } as unknown as FrameParts
}

const show = (over: Partial<FrameParts>) => render(<MemoryRouter><PhoneFrame {...parts(over)} /></MemoryRouter>)

withFeature('livePreview', () => {
describe('the phone\'s live preview footer @SC-1697', () => {
  it('says the agent is working and the app reloads when it saves', () => {
    show({})
    expect(screen.getByTestId('phone-preview-footer').textContent).toBe('Kernel is working · reloads when it saves')
  })

  it('says nothing while the agent is idle, or with no live preview running', () => {
    show({ activity: { working: false } as FrameParts['activity'] })
    expect(screen.queryByTestId('phone-preview-footer')).toBeNull()
    cleanup()
    show({ previewState: 'stopped' })
    expect(screen.queryByTestId('phone-preview-footer')).toBeNull()
  })
})
})
