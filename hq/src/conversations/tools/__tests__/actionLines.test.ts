/**
 * Which completed calls write an action line, what each names and where it points, and when a task card follows
 * (on-screen spec, Messages). The store and the sockets are stand-ins; the lines are tested as they would be stored.
 */
import { describe, it, expect } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { AppendMessageInput } from '../../contract'
import { showInTool } from '../../toolLink'
import { createActionWriter, writesLine, type TaskFacts } from '../actionLines'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

const TASK: TaskFacts = { id: 't1', key: 'WEB-27', title: 'Fix the footer' }
const capability = turnCapability()

function harness(tasks: TaskFacts[] = [TASK]) {
  const stored: AppendMessageInput[] = []
  const emitted: ConversationMessageView[] = []
  const writer = createActionWriter({
    taskOf: async id => tasks.find(t => t.id === id) ?? null,
    placeOf: async () => ({ type: 'project', id: 'p1' }),
    append: async input => {
      stored.push(input)
      const message = { ...input, seq: stored.length } as unknown as ConversationMessageView
      return { message, duplicate: false }
    },
    emit: (_c, m) => { emitted.push(m) },
  })
  return { writer, stored, emitted }
}

describe('which calls write a line @SC-1010', () => {
  it('writes for tools that change something and not for those that only read', () => {
    for (const name of ['create_task', 'update_task', 'add_comment', 'create_board', 'remember', 'forget', 'create_project']) {
      expect(writesLine(name), name).toBe(true)
    }
    for (const name of ['list_tasks', 'get_task_details', 'get_board', 'recall', 'used_memory', 'expand', 'messages', 'ledger']) {
      expect(writesLine(name), name).toBe(false)
    }
  })

  it('writes nothing for a read', async () => {
    const { writer, stored } = harness()
    await writer.write(capability, 'list_tasks', {}, { tasks: [] })
    expect(stored).toEqual([])
  })
})

describe('the line and its target @SC-1010', () => {
  it('names a created task, points to Tasks by its key and follows with the task card', async () => {
    const { writer, stored, emitted } = harness()
    await writer.write(capability, 'create_task', { title: 'Fix the footer' }, { taskId: 't1' })
    expect(stored.map(m => m.kind)).toEqual(['ACTION', 'TASK'])
    expect(stored[0]).toMatchObject({
      role: 'AGENT', conversationId: capability.conversationId, turnId: capability.turnId, agentId: capability.agentId,
      body: { text: 'Created WEB-27 Fix the footer', toolName: 'create_task', target: { kind: 'task', id: 'WEB-27', label: 'WEB-27 Fix the footer' } },
    })
    expect(stored[1]!.body).toEqual({ taskId: 't1', taskKey: 'WEB-27', title: 'Fix the footer' })
    expect(emitted).toHaveLength(2)
  })

  it('writes the card for a changed task, but only the line for a comment, an archive or an attachment', async () => {
    for (const [tool, kinds] of [
      ['update_task', ['ACTION', 'TASK']], ['add_comment', ['ACTION']], ['archive_task', ['ACTION']], ['attach_file', ['ACTION']],
    ] as const) {
      const { writer, stored } = harness()
      await writer.write(capability, tool, { taskId: 't1', filename: 'a.png' }, { success: true })
      expect(stored.map(m => m.kind), tool).toEqual(kinds)
      expect(stored[0]!.body, tool).toMatchObject({ toolName: tool, target: { kind: 'task', id: 'WEB-27' } })
    }
  })

  it('names a deleted task from before the call and links nothing', async () => {
    const { writer, stored } = harness([])
    await writer.write(capability, 'delete_task', { taskId: 't1' }, { success: true }, TASK)
    expect(stored).toHaveLength(1)
    expect(stored[0]!.body).toEqual({ text: 'Deleted WEB-27 Fix the footer', toolName: 'delete_task' })
  })

  it('points a created board to Boards, a memory to Memory by its key', async () => {
    const board = harness()
    await board.writer.write(capability, 'create_board', { name: 'Launch' }, { boardId: 'b1' })
    expect(board.stored[0]!.body).toMatchObject({ target: { kind: 'board', id: 'b1', label: 'Launch' } })

    const memory = harness()
    await memory.writer.write(capability, 'remember', { title: 'Prefers short answers' }, { status: 'added', key: 'prefers-short-answers', scope: 'person' })
    expect(memory.stored[0]!.body).toMatchObject({
      text: 'Remembered Prefers short answers',
      target: { kind: 'memory', id: 'prefers-short-answers', params: { scope: 'PERSON' } },
    })
  })

  it('points a memory to the scope it was written in: the agent, and for a place, which place', async () => {
    const mine = harness()
    await mine.writer.write(capability, 'remember', { title: 'Tea' }, { status: 'added', key: 'tea', scope: 'agent_person' })
    expect(mine.stored[0]!.body).toMatchObject({ target: { params: { scope: 'AGENT_PERSON', agent: capability.agentId } } })

    const place = harness()
    await place.writer.write(capability, 'remember', { title: 'Deploys' }, { status: 'added', key: 'deploys', scope: 'agent_place' })
    expect(place.stored[0]!.body).toMatchObject({ target: { params: { scope: 'AGENT_PLACE', agent: capability.agentId, place: 'project:p1' } } })
  })

  it('names a project, a team or an agent without a link, since no tool opens them', async () => {
    const { writer, stored } = harness()
    await writer.write(capability, 'create_project', { name: 'Shop' }, { projectId: 'p1' })
    expect(stored[0]!.body).toEqual({ text: 'Created the project Shop', toolName: 'create_project' })
  })

  it('names a change with no line of its own by the tool, and still writes it', async () => {
    const { writer, stored } = harness()
    await writer.write(capability, 'update_org', {}, { success: true })
    expect(stored[0]!.body).toEqual({ text: 'Update org', toolName: 'update_org' })
  })
})

describe('each tool marks the item its line names @SC-1010', () => {
  it('builds a link to the tool for every target the writer makes', () => {
    const place = '/projects/WEB'
    expect(showInTool({ kind: 'task', id: 'WEB-27', label: 'x' }, place)).toEqual({ label: 'Show in Tasks', href: '/projects/WEB?tool=tasks&task=WEB-27' })
    expect(showInTool({ kind: 'board', id: 'b1', label: 'x' }, place)?.href).toBe('/projects/WEB?tool=boards&board=b1')
    // Memory opens on its own screen, which holds every scope, with the item marked (walkthrough finding 35).
    expect(showInTool({ kind: 'memory', id: 'k', label: 'x', params: { scope: 'AGENT_PERSON', agent: 'a 1' } }, place))
      .toEqual({ label: 'Show in Memory', href: '/settings/memory?scope=AGENT_PERSON&agent=a+1&memory=k' })
    expect(showInTool({ kind: 'memory', id: 'k', label: 'x' }, '/chat')?.href).toBe('/settings/memory?memory=k')
    expect(showInTool({ kind: 'run', id: 'r1', label: 'x' }, place)?.href).toBe('/projects/WEB?tool=runs&run=r1')
    expect(showInTool({ kind: 'automation', id: 'rt1', label: 'x' }, place)?.href).toBe('/projects/WEB?tool=automation&routine=rt1')
  })
})
