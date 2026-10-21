// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const ops = vi.hoisted(() => ({ useQuery: vi.fn(), setMemoryEmbeddingModel: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, useAction: (fn: unknown) => fn, getMemoryMeasurements: 'getMemoryMeasurements',
  setMemoryEmbeddingModel: ops.setMemoryEmbeddingModel,
}))
vi.mock('../../../../org/pages/OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrgAdminHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import { MemorySettingsPage } from '../MemorySettingsPage'

const MEASURED = {
  included: 12, hinted: 4, recalled: 6, used: 9, unused: 3, missed: 2,
  certainBar: 0.62, probableBar: 0.45, embeddingModel: 'local', reembedding: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  ops.useQuery.mockReturnValue({ data: MEASURED })
  ops.setMemoryEmbeddingModel.mockResolvedValue({ ok: true })
})

describe('MemorySettingsPage @SC-991', () => {
  it('shows each figure and the share relied on', () => {
    render(<MemorySettingsPage />)
    expect(screen.getByText('Agents relied on 75% of the memories they were given. Recall tuning: certain at 0.62, probable at 0.45.')).toBeTruthy()
    for (const [label, n] of [['Included in a reply', '12'], ['Named as a hint', '4'], ['Recalled on request', '6'], ['Relied on', '9'], ['Not relied on', '3'], ['Missed', '2']]) {
      expect(screen.getByText(label).previousSibling?.textContent).toBe(n)
    }
  })

  it('shows how far a switch has got and offers to stop it', async () => {
    ops.useQuery.mockReturnValue({ data: { ...MEASURED, reembedding: { to: 'openai/text-embedding-3-small', done: 40, total: 100 } } })
    render(<MemorySettingsPage />)
    expect(screen.getByRole('status').textContent).toBe('Moving to openai/text-embedding-3-small: 40 of 100 memories done.')
    fireEvent.click(screen.getByText('Stop switching'))
    await waitFor(() => expect(ops.setMemoryEmbeddingModel).toHaveBeenCalledWith({ model: 'local' }))
  })

  it('switches to the model typed, and shows a refusal', async () => {
    render(<MemorySettingsPage />)
    fireEvent.change(screen.getByPlaceholderText('openai/text-embedding-3-small'), { target: { value: ' openai/text-embedding-3-small ' } })
    fireEvent.click(screen.getByText('Switch'))
    await waitFor(() => expect(ops.setMemoryEmbeddingModel).toHaveBeenCalledWith({ model: 'openai/text-embedding-3-small' }))
    ops.setMemoryEmbeddingModel.mockRejectedValue(new Error('The organisation has no openai key'))
    fireEvent.change(screen.getByPlaceholderText('openai/text-embedding-3-small'), { target: { value: 'openai/x' } })
    fireEvent.click(screen.getByText('Switch'))
    expect((await screen.findByRole('alert')).textContent).toBe('The organisation has no openai key')
  })
})
