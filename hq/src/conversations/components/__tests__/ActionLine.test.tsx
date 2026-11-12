// @vitest-environment jsdom
/**
 * The "Remembered" line (spec decision 6): "✓ Kernel remembered this" and Show, which opens the memory's dialog in
 * place, over the chat, rather than going to Settings. A line written before the memory's id was kept still links.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../../memory/screen/pages/MemoryDialog', () => ({
  MemoryDialog: ({ itemId, fromOutside }: { itemId: string | null; fromOutside?: boolean }) =>
    itemId ? <div role="dialog" aria-label="Memory">{`${itemId}${fromOutside ? ' from outside' : ''}`}</div> : null,
}))

import { ActionLine } from '../ActionLine'

const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('the Remembered line @SC-2112', () => {
  it('says the agent remembered this, and Show opens the memory over the chat', () => {
    at(<ActionLine body={{ text: 'Kernel remembered this', toolName: 'remember', target: { kind: 'memory', id: 'tables', label: 'Tables', params: { item: 'm1' } } }} />)
    expect(screen.getByTestId('action-line').textContent).toBe('✓ Kernel remembered this · Show')
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('dialog', { name: 'Memory' }).textContent).toBe('m1 from outside')
  })

  it('keeps an older line\'s link to the memory screen', () => {
    at(<ActionLine body={{ text: 'Remembered Tables', toolName: 'remember', target: { kind: 'memory', id: 'tables', label: 'Tables', params: { scope: 'AGENT_PERSON', agent: 'a1' } } }} />)
    expect(screen.getByRole('link', { name: 'Show in Memory' }).getAttribute('href')).toBe('/settings/memory?scope=AGENT_PERSON&agent=a1&memory=tables')
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
  })
})
