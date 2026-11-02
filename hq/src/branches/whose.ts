/**
 * Whose work a branch is, as the branch select and an agent's prompt say it: the task (its key and title) or the
 * conversation (its title, else what the person first asked), and the person it is for.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceBranch } from '@prisma/client'
import { peopleByIds } from '../server/identity/people'
import { openJson } from '../conversations/sealing'
import type { BranchWhose } from './views'

type Row = Pick<WorkspaceBranch, 'id' | 'taskId' | 'conversationId' | 'userId' | 'name'>

const TITLE_MAX = 120

/** What the person first asked in a conversation, as one line; null when nothing was asked yet. */
export async function firstAsk(conversationId: string): Promise<string | null> {
  const first = await prisma.conversationMessage.findFirst({
    where: { conversationId, role: 'PERSON' },
    orderBy: { seq: 'asc' },
    select: { body: true },
  })
  if (!first) return null
  const text = openJson<{ text?: unknown }>(first.body).text
  return typeof text === 'string' && text.trim() ? text.trim().split('\n')[0]!.slice(0, TITLE_MAX) : null
}

export async function whoseOf(rows: readonly Row[]): Promise<Map<string, BranchWhose>> {
  const taskIds = rows.flatMap(r => (r.taskId ? [r.taskId] : []))
  const conversationIds = rows.flatMap(r => (r.conversationId ? [r.conversationId] : []))
  const [tasks, conversations, people] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true, number: true, project: { select: { key: true } } } }),
    prisma.conversation.findMany({ where: { id: { in: conversationIds } }, select: { id: true, title: true } }),
    peopleByIds(rows.map(r => r.userId)),
  ])
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const conversationById = new Map(conversations.map(c => [c.id, c]))
  const out = new Map<string, BranchWhose>()
  for (const r of rows) {
    const personName = people.get(r.userId)?.name ?? null
    const personId = r.userId
    if (r.taskId) {
      const t = taskById.get(r.taskId)
      out.set(r.id, { kind: 'task', taskId: r.taskId, taskKey: t ? `${t.project.key}-${t.number}` : null, title: t?.title ?? r.name, personId, personName })
    } else if (r.conversationId) {
      const title = conversationById.get(r.conversationId)?.title ?? (await firstAsk(r.conversationId)) ?? r.name
      out.set(r.id, { kind: 'conversation', conversationId: r.conversationId, title, personId, personName })
    }
  }
  return out
}

/** *Ada · Login form*: the person, then the work, for an agent's prompt. */
export async function whoseLines(rows: readonly Row[]): Promise<Map<string, string>> {
  const whose = await whoseOf(rows)
  return new Map([...whose].map(([id, w]) => [id, [w.personName, w.title].filter(Boolean).join(' · ')]))
}

/** The agent each branch's work belongs to, by name: the task's assigned agent, or the conversation's. */
export async function workAgents(rows: readonly Row[]): Promise<Map<string, string>> {
  const [tasks, conversations] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: rows.flatMap(r => (r.taskId ? [r.taskId] : [])) } }, select: { id: true, assignedAgent: { select: { name: true } } } }),
    prisma.conversation.findMany({ where: { id: { in: rows.flatMap(r => (r.conversationId ? [r.conversationId] : [])) } }, select: { id: true, agent: { select: { name: true } } } }),
  ])
  const byTask = new Map(tasks.map(t => [t.id, t.assignedAgent?.name ?? null]))
  const byConversation = new Map(conversations.map(c => [c.id, c.agent?.name ?? null]))
  const out = new Map<string, string>()
  for (const r of rows) {
    const name = r.taskId ? byTask.get(r.taskId) : r.conversationId ? byConversation.get(r.conversationId) : null
    if (name) out.set(r.id, name)
  }
  return out
}
