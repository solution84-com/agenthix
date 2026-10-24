import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type WorkflowsScreen =
  | { view: 'list' }
  | { view: 'workflow'; workflowId: string; tab: 'steps' | 'versions' | 'runs' }
  | { view: 'version'; workflowId: string; number: number; against: number | null }
  | { view: 'run'; workflowId: string; runId: string }

const OWN = ['workflow', 'wtab', 'version', 'against', 'run'] as const
type Own = (typeof OWN)[number]

const whole = (v: string | null): number | null => (v && /^[1-9]\d*$/.test(v) ? Number(v) : null)

/**
 * Where the Workflows section is, read from the address (the section keeps its state there, as Automation does):
 * `?tool=workflows&workflow=<id>` a workflow, `&wtab=versions|runs`, `&version=<n>` its full review (`&against=<m>`
 * compares two versions), `&run=<runId>` a run. Names start with `w` where another tool might use the same idea.
 */
export function workflowsScreenOf(params: URLSearchParams): WorkflowsScreen {
  const workflowId = params.get('workflow')
  if (!workflowId) return { view: 'list' }
  const runId = params.get('run')
  if (runId) return { view: 'run', workflowId, runId }
  const number = whole(params.get('version'))
  if (number !== null) return { view: 'version', workflowId, number, against: whole(params.get('against')) }
  const tab = params.get('wtab')
  return { view: 'workflow', workflowId, tab: tab === 'versions' || tab === 'runs' ? tab : 'steps' }
}

/** The address of a screen inside a place's section, from the place's own address. */
export function workflowsAddress(base: string, screen: Exclude<WorkflowsScreen, { view: 'list' }> | { view: 'list' }): string {
  const q = new URLSearchParams({ tool: 'workflows' })
  if (screen.view === 'workflow') {
    q.set('workflow', screen.workflowId)
    if (screen.tab !== 'steps') q.set('wtab', screen.tab)
  } else if (screen.view === 'version') {
    q.set('workflow', screen.workflowId)
    q.set('version', String(screen.number))
    if (screen.against !== null) q.set('against', String(screen.against))
  } else if (screen.view === 'run') {
    q.set('workflow', screen.workflowId)
    q.set('run', screen.runId)
  }
  return `${base}?${q.toString()}`
}

export function useWorkflowsUrl() {
  const [params, setParams] = useSearchParams()
  const screen = workflowsScreenOf(params)

  const go = useCallback((values: Partial<Record<Own, string>>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    })
  }, [setParams])

  return {
    screen,
    toList: useCallback(() => go({}), [go]),
    toWorkflow: useCallback((workflowId: string, tab?: 'versions' | 'runs') => go({ workflow: workflowId, wtab: tab }), [go]),
    toVersion: useCallback((workflowId: string, number: number, against?: number) => go({ workflow: workflowId, version: String(number), against: against ? String(against) : undefined }), [go]),
    toRun: useCallback((workflowId: string, runId: string) => go({ workflow: workflowId, run: runId }), [go]),
  }
}
