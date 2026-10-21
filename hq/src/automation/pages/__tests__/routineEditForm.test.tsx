// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { RoutineForm } from '@agenthix/ui/tasks'

afterEach(cleanup)

const BOARDS = [{ id: 'b1', name: 'Ops', stages: [{ name: 'todo', label: 'To do' }, { name: 'ready', label: 'Ready' }] }]
const AGENTS = [{ id: 'ax', name: 'AgentX' }, { id: 'ay', name: 'AgentY' }]

describe("editing a routine covers the whole task template and the schedule", () => {
  it('shows every template field and saves a changed agent, board, column, priority and labels', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <RoutineForm
        initial={{
          title: 'Review', description: 'Look', priority: 'LOW', labels: ['ops'], assignedAgentId: null,
          boardId: null, stage: null, rule: { kind: 'interval', every: 1, unit: 'days' }, at: null,
        }}
        boards={BOARDS} agents={AGENTS} submitLabel="Save" onSubmit={onSubmit} onCancel={() => {}}
      />,
    )
    for (const label of ['Title of each round', 'Description', 'Priority', 'Agent', 'Labels, comma-separated', 'Starts on', 'When rounds come']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'ay' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'HIGH' } })
    fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: 'b1' } })
    fireEvent.change(screen.getByLabelText('Column'), { target: { value: 'ready' } })
    fireEvent.change(screen.getByLabelText('Labels, comma-separated'), { target: { value: 'ops, weekly' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const { template, schedule } = onSubmit.mock.calls[0][0]
    expect(template).toMatchObject({
      title: 'Review', priority: 'HIGH', labels: ['ops', 'weekly'], assignedAgentId: 'ay', boardId: 'b1', stage: 'ready',
    })
    expect(schedule).toBeUndefined()
  })
})
