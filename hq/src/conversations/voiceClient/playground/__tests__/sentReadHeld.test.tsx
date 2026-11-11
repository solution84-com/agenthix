// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReadNudgesHeld } from '@agenthix/ui/attention'
import { LineDialog } from '../ScenarioDialogs'
import { NO_RUN } from '../scenarioRun'

afterEach(cleanup)

const scenario = { id: 's1', wanted: 'hold' as const, conversation: [], last: 'Hello' }
const library = { groups: [{ id: 'hold' as const, title: 'Hold', scenarios: [scenario] }], inputTokensPerRun: 1 }

function open(held: boolean) {
  render(
    <ReadNudgesHeld.Provider value={held}>
      <LineDialog
        library={library} run={{ ...NO_RUN, models: ['a'] }} scenario={scenario} labelOf={(m) => m} onMove={() => {}} onClose={() => {}}
        sent={() => Promise.reject(new Error('HQ did not answer'))}
      />
    </ReadNudgesHeld.Provider>,
  )
  fireEvent.click(screen.getByText('Show exactly what was sent'))
}

describe('the call that could not be read, while the frame line says HQ is not answering @SC-1933', () => {
  it('says it with Try again when the frame line is not showing', async () => {
    open(false)
    await screen.findByText(/The call could not be read/)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('says nothing of its own while the frame line shows', async () => {
    open(true)
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByText(/The call could not be read/)).toBeNull()
  })
})
