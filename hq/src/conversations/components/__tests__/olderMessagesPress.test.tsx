// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), getUserSettings: 'getUserSettings' }))

import { ThreadMessages } from '../ThreadMessages'

afterEach(cleanup)

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
function thread(props: Partial<Parameters<typeof ThreadMessages>[0]>, held = false) {
  return render(
    <ReadNudgesHeld.Provider value={held}>
      <ThreadMessages
        messages={[]} waiting={[]} stream={null} running={false} agent={agent} hasMore loadingOlder={false}
        onLoadOlder={() => {}} busy={false} onSendNow={() => {}} onCancel={() => {}} olderHeld {...props}
      />
    </ReadNudgesHeld.Provider>,
  )
}

describe('Show earlier messages @SC-1004 @SC-1933', () => {
  it('is the person\'s press, so it asks to be read once and not retried quietly', () => {
    const onLoadOlder = vi.fn()
    thread({ onLoadOlder })
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier messages' }))
    expect(onLoadOlder).toHaveBeenCalledWith(true)
  })

  it('is not read on its own after a press failed, until a press works', () => {
    const onLoadOlder = vi.fn()
    thread({ onLoadOlder })
    expect(onLoadOlder).not.toHaveBeenCalled()
  })

  it('keeps its line for the scroll\'s failure, and Try again there is not a press', () => {
    const onLoadOlder = vi.fn()
    thread({ onLoadOlder, olderFailed: true, olderHeld: false })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onLoadOlder).toHaveBeenCalledWith()
  })

  it('holds that line back while the frame line says HQ is not answering', () => {
    thread({ olderFailed: true, olderHeld: false }, true)
    expect(screen.queryByTestId('older-failed')).toBeNull()
  })
})
