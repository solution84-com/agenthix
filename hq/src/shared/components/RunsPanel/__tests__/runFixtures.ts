import type { MyRun } from '../../../../runs/queries'

export const run = (id: string, extra: Partial<MyRun> = {}): MyRun => ({
  key: id, group: 'running', kind: 'task', sessionId: `sess-${id}`,
  title: `Task ${id}`, ref: 'P-1', href: '/tasks/P-1',
  place: { name: 'Project P', projectKey: 'P' },
  task: { id: `t-${id}`, runState: 'RUN_ACTIVE' },
  agent: { id: 'a1', name: 'Bot', handle: 'bot', avatarUrl: null },
  startedBy: { kind: 'person', name: 'ana' },
  onBehalfOf: { id: 'u1', name: 'ana' },
  startedByMe: true, onMyBehalf: true, startedByText: null, wantsApproval: false,
  wait: null, state: null, startedAt: null, endedAt: null,
  updatedAt: new Date().toISOString(), siteSilence: null,
  ...extra,
})
