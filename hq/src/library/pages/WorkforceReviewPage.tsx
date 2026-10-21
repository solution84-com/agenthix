import { useQuery, useAction } from 'wasp/client/operations'
import { getWorkforceTemplate, getExistingAgentHandles, getWorkforceReviewTask } from 'wasp/client/operations'
import { applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft } from 'wasp/client/operations'
import { useSearchParams, useNavigate } from 'react-router'
import { useState, useEffect, useMemo } from 'react'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, Save } from 'lucide-react'
import type { WorkforceTemplateContent, ApplicationSelections } from '../workforceTemplateTypes'
import { buildInitialSelections } from '../workforceTemplateTypes'

export function WorkforceReviewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const templateId = params.get('templateId')
  const taskId = params.get('taskId')

  // When arriving from an agent proposal, applicationData on the task holds the templateId
  const [resolvedTemplateId, setResolvedTemplateId] = useState<string | null>(templateId)

  // Load task first — needed to resolve templateId when it's missing from the URL
  const { data: reviewTask } = useQuery(
    getWorkforceReviewTask,
    taskId ? { taskId } : undefined,
    { enabled: !!taskId }
  )

  // If templateId is missing from the URL, fall back to applicationData.templateId on the task.
  // This handles proposals where only taskId was linked (e.g. old tasks, Org page banner).
  useEffect(() => {
    if (taskId && !templateId && reviewTask) {
      const appData = (reviewTask.applicationData as any) ?? {}
      if (appData.templateId) setResolvedTemplateId(appData.templateId)
    }
  }, [taskId, templateId, reviewTask])

  const { data: template, isLoading: templateLoading } = useQuery(
    getWorkforceTemplate,
    resolvedTemplateId ? { id: resolvedTemplateId } : undefined,
    { enabled: !!resolvedTemplateId }
  )
  const { data: existingHandles = [] } = useQuery(getExistingAgentHandles)
  const applyAction = useAction(applyWorkforceTemplate)
  const confirmAction = useAction(confirmWorkforceTemplate)
  const saveDraftAction = useAction(saveWorkforceDraft)

  const [selections, setSelections] = useState<ApplicationSelections | null>(null)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build initial selections when template + existing handles are loaded.
  // If a draft was saved (agent-initiated path), restore from it instead.
  useEffect(() => {
    if (!template || existingHandles === undefined) return
    const appData = (reviewTask?.applicationData as any) ?? {}
    if (appData.draftSelections) {
      // Restore saved draft
      setSelections(appData.draftSelections)
      setExpandedTeams(new Set((appData.draftSelections as ApplicationSelections).teams.map((t: any) => t.name)))
    } else {
      const content = template.content as WorkforceTemplateContent
      const initial = buildInitialSelections(content, new Set(existingHandles))
      setSelections(initial)
      // Expand all teams by default
      setExpandedTeams(new Set(initial.teams.map((t) => t.name)))
    }
  }, [template, existingHandles, reviewTask])

  const hasCollision = useMemo(() => {
    if (!selections) return false
    return selections.teams.some((team) =>
      team.agents.some((agent) => agent.include && agent.handle !== agent.resolvedHandle)
    )
  }, [selections])

  const canApply = !!selections && !applying

  // ── Selection toggles ─────────────────────────────────────────────────────

  function toggleTeam(teamName: string) {
    setSelections((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.name === teamName ? { ...t, include: !t.include } : t
        ),
      }
    })
  }

  function toggleAgent(teamName: string, agentHandle: string) {
    setSelections((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        teams: prev.teams.map((t) => {
          if (t.name !== teamName) return t
          return {
            ...t,
            agents: t.agents.map((a) =>
              a.handle === agentHandle ? { ...a, include: !a.include } : a
            ),
          }
        }),
      }
    })
  }

  function toggleSkill(teamName: string, agentHandle: string, skillSlug: string) {
    setSelections((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        teams: prev.teams.map((t) => {
          if (t.name !== teamName) return t
          return {
            ...t,
            agents: t.agents.map((a) => {
              if (a.handle !== agentHandle) return a
              return {
                ...a,
                skills: a.skills.map((s) =>
                  s.slug === skillSlug ? { ...s, include: !s.include } : s
                ),
              }
            }),
          }
        }),
      }
    })
  }

  function updateResolvedHandle(teamName: string, agentHandle: string, newHandle: string) {
    setSelections((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        teams: prev.teams.map((t) => {
          if (t.name !== teamName) return t
          return {
            ...t,
            agents: t.agents.map((a) =>
              a.handle === agentHandle ? { ...a, resolvedHandle: newHandle } : a
            ),
          }
        }),
      }
    })
  }

  function toggleProject(projectName: string) {
    setSelections((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        projects: prev.projects.map((p) =>
          p.name === projectName ? { ...p, include: !p.include } : p
        ),
      }
    })
  }

  // ── Apply ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selections || !taskId) return
    setSaving(true)
    setError(null)
    try {
      await saveDraftAction({ taskId, selections })
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  async function handleApply() {
    if (!selections || !resolvedTemplateId) return
    setApplying(true)
    setError(null)
    try {
      if (taskId) {
        await confirmAction({ taskId, selections })
      } else {
        await applyAction({ templateId: resolvedTemplateId, selections })
      }
      navigate('/org')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setApplying(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (templateLoading || !selections) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Review Template' }]}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      </AppLayout>
    )
  }

  if (!template) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Review Template' }]}>
        <div className="text-text-secondary text-body">Template not found.</div>
      </AppLayout>
    )
  }

  const content = template.content as WorkforceTemplateContent

  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: `Review: ${template.name}` }]}>
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        {/* Header */}
        <div>
          <h1 className="text-h1 font-semibold text-text-primary">{template.name}</h1>
          <p className="text-body text-text-secondary mt-1">{template.description}</p>
        </div>

        {taskId && (
          <div className="text-small text-text-muted bg-surface-2 rounded-lg px-3 py-2">
            Agent-proposed template — review selections and confirm to queue for assembly.
          </div>
        )}

        {/* Teams + Agents */}
        <section className="space-y-3">
          <h2 className="text-h2 font-semibold text-text-muted">Teams & Agents</h2>
          {selections.teams.map((teamSel) => {
            const teamSpec = content.teams.find((t) => t.name === teamSel.name)
            const expanded = expandedTeams.has(teamSel.name)
            return (
              <div key={teamSel.name} className="border border-border rounded-lg overflow-hidden">
                {/* Team row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={teamSel.include}
                    onChange={() => toggleTeam(teamSel.name)}
                    className="rounded border-border bg-transparent text-accent cursor-pointer"
                  />
                  <button
                    onClick={() => setExpandedTeams((prev) => {
                      const next = new Set(prev)
                      expanded ? next.delete(teamSel.name) : next.add(teamSel.name)
                      return next
                    })}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                    <span className="text-body font-medium text-text-primary">{teamSel.name}</span>
                    <span className="text-small text-text-muted">{teamSpec?.purpose}</span>
                  </button>
                </div>

                {/* Agent rows */}
                {expanded && teamSel.agents.map((agentSel) => {
                  const agentSpec = teamSpec?.agents.find((a) => a.handle === agentSel.handle)
                  const isColliding = agentSel.include && agentSel.handle !== agentSel.resolvedHandle
                  return (
                    <div key={agentSel.handle} className="border-t border-border-subtle">
                      <div className="flex items-start gap-3 px-4 py-2.5 pl-8">
                        <input
                          type="checkbox"
                          checked={agentSel.include}
                          disabled={!teamSel.include}
                          onChange={() => toggleAgent(teamSel.name, agentSel.handle)}
                          className="mt-0.5 rounded border-border bg-transparent text-accent cursor-pointer disabled:opacity-30"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body text-text-primary">{agentSpec?.name}</span>
                            <span className="text-small text-text-muted">{agentSpec?.role}</span>
                            {isColliding && (
                              <span className="flex items-center gap-1 text-small text-warning">
                                <AlertTriangle className="w-3 h-3" />
                                handle collision
                              </span>
                            )}
                          </div>
                          {/* Handle input */}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-micro text-text-muted">handle:</span>
                            <input
                              type="text"
                              value={agentSel.resolvedHandle}
                              disabled={!agentSel.include || !teamSel.include}
                              onChange={(e) => updateResolvedHandle(teamSel.name, agentSel.handle, e.target.value)}
                              className="text-small bg-surface-2 border border-border rounded px-2 py-0.5 text-text-secondary w-32 disabled:opacity-30"
                            />
                            {isColliding && (
                              <span className="text-micro text-warning/70">was: {agentSel.handle}</span>
                            )}
                          </div>
                          {/* Skills */}
                          {agentSel.skills.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {agentSel.skills.map((skillSel) => {
                                const skillSpec = agentSpec?.skills?.find((s) => s.slug === skillSel.slug)
                                return (
                                  <label key={skillSel.slug} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={skillSel.include}
                                      disabled={!agentSel.include || !teamSel.include}
                                      onChange={() => toggleSkill(teamSel.name, agentSel.handle, skillSel.slug)}
                                      className="rounded border-border bg-transparent text-accent cursor-pointer disabled:opacity-30"
                                    />
                                    <span className="text-micro text-text-muted">{skillSpec?.name ?? skillSel.slug}</span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>

        {/* Projects */}
        <section className="space-y-3">
          <h2 className="text-h2 font-semibold text-text-muted">Projects & Boards</h2>
          {selections.projects.map((projectSel) => {
            const projectSpec = content.projects.find((p) => p.name === projectSel.name)
            return (
              <div key={projectSel.name} className="border border-border rounded-lg px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={projectSel.include}
                    onChange={() => toggleProject(projectSel.name)}
                    className="rounded border-border bg-transparent text-accent cursor-pointer"
                  />
                  <span className="text-body font-medium text-text-primary">{projectSel.name}</span>
                  <span className="text-small text-text-muted">{projectSpec?.description}</span>
                </div>
                <div className="pl-7 space-y-0.5">
                  {projectSel.boards.map((boardSel) => (
                    <span key={boardSel.name} className="text-micro text-text-muted block">
                      → {boardSel.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        {/* Errors */}
        {error && (
          <div className="text-body text-danger bg-danger/10 rounded-lg px-4 py-3">{error}</div>
        )}

        {/* Action */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            {taskId && (
              <button
                onClick={handleSave}
                disabled={!selections || saving || applying}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-body hover:text-text-primary hover:border-border disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Progress
              </button>
            )}
            {savedAt && !saving && (
              <span className="text-small text-text-muted">Saved {savedAt.toLocaleTimeString()}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-small text-text-muted">
              {hasCollision ? 'Handle collisions detected — review handles before applying.' : 'All handles are available.'}
            </span>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className="px-5 py-2 rounded-lg bg-accent text-on-accent text-body font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {taskId ? 'Confirm & Apply' : 'Apply Template'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
