import { useQuery, useAction } from 'wasp/client/operations'
import { getWorkforceTemplate, getExistingAgentHandles, getWorkforceReviewTask } from 'wasp/client/operations'
import { applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft } from 'wasp/client/operations'
import { useSearchParams, useNavigate } from 'react-router'
import { useState, useEffect, useMemo } from 'react'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, Save } from 'lucide-react'
import type { WorkforceTemplateContent, ApplicationSelections, ProjectSpec } from '../workforceTemplateTypes'
import { buildInitialSelections, handleProblems, isApplicationSelections } from '../workforceTemplateTypes'
import { toggleTeam, toggleAgent, toggleSkill, setResolvedHandle, toggleProject } from './reviewSelectionEdits'
import { MissingSkillsNotice } from './MissingSkillsNotice'
import { FIELD as FIELD_LOOK, Button } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

/** A proposal task keeps the template it proposes and a saved draft in its application data. */
function applicationDataOf(value: unknown): { templateId?: string; draftSelections?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

export function WorkforceReviewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const templateId = params.get('templateId')
  const taskId = params.get('taskId')

  // When arriving from an agent proposal, applicationData on the task holds the templateId
  const [resolvedTemplateId, setResolvedTemplateId] = useState<string | null>(templateId)

  // Load task first — needed to resolve templateId when it's missing from the URL
  const taskQuery = useQuery(
    getWorkforceReviewTask,
    taskId ? { taskId } : undefined,
    { enabled: !!taskId }
  )
  const { data: reviewTask } = taskQuery
  const readTask = useBackgroundRead(taskQuery, { what: 'The proposal' })

  // If templateId is missing from the URL, fall back to applicationData.templateId on the task.
  // This handles proposals where only taskId was linked (e.g. old tasks, Org page banner).
  useEffect(() => {
    if (taskId && !templateId && reviewTask) {
      const appData = applicationDataOf(reviewTask.applicationData)
      if (appData.templateId) setResolvedTemplateId(appData.templateId)
    }
  }, [taskId, templateId, reviewTask])

  const templateQuery = useQuery(
    getWorkforceTemplate,
    resolvedTemplateId ? { id: resolvedTemplateId } : undefined,
    { enabled: !!resolvedTemplateId }
  )
  const { data: template, isLoading: templateLoading } = templateQuery
  const readTemplate = useBackgroundRead(templateQuery, { what: 'The template' })
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
  const [missingSkills, setMissingSkills] = useState<string[] | null>(null)

  // Build initial selections when template + existing handles are loaded.
  // If a draft was saved (agent-initiated path), restore from it instead.
  useEffect(() => {
    if (!template || existingHandles === undefined) return
    const appData = applicationDataOf(reviewTask?.applicationData)
    if (isApplicationSelections(appData.draftSelections)) {
      // Restore saved draft
      setSelections(appData.draftSelections)
      setExpandedTeams(new Set(appData.draftSelections.teams.map(t => t.name)))
    } else {
      const content = template.content as WorkforceTemplateContent
      const initial = buildInitialSelections(content, new Set(existingHandles))
      setSelections(initial)
      // Expand all teams by default
      setExpandedTeams(new Set(initial.teams.map((t) => t.name)))
    }
  }, [template, existingHandles, reviewTask])

  // Every handle the person typed is checked against the agents there are and against each other.
  const problems = useMemo(() => (selections ? handleProblems(selections, new Set(existingHandles)) : {}), [selections, existingHandles])
  const hasProblem = Object.keys(problems).length > 0

  const canApply = !!selections && !applying && !hasProblem

  // ── Selection toggles ─────────────────────────────────────────────────────

  const edit = (change: (s: ApplicationSelections) => ApplicationSelections) => setSelections(prev => (prev ? change(prev) : prev))

  // ── Apply ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selections || !taskId) return
    setSaving(true)
    setError(null)
    try {
      await saveDraftAction({ taskId, selections })
      setSavedAt(new Date())
    } catch (err) {
      setError(pressFailureWords(err, 'Failed to save draft'))
    } finally {
      setSaving(false)
    }
  }

  async function handleApply() {
    if (!selections || !resolvedTemplateId) return
    setApplying(true)
    setError(null)
    try {
      const result = taskId
        ? await confirmAction({ taskId, selections })
        : await applyAction({ templateId: resolvedTemplateId, selections })
      // A template that could not bring a skill says so before the person moves on.
      if (result.missingSkills.length > 0) setMissingSkills(result.missingSkills)
      else navigate('/org')
    } catch (err) {
      setError(pressFailureWords(err, 'Something went wrong'))
    } finally {
      setApplying(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // A read that failed through its retries is said in place of the page, not left as a spinner.
  const failedRead = readTemplate.failedWithoutData ? readTemplate : readTask.failedWithoutData ? readTask : null
  if (failedRead) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Review Template' }]}>{failedRead.nudge}</AppLayout>
    )
  }

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

  if (missingSkills) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: `Review: ${template.name}` }]}>
        <div className="max-w-2xl mx-auto space-y-4 py-6">
          <p className="text-body text-text-primary">{template.name} was applied.</p>
          <MissingSkillsNotice skills={missingSkills} />
          <Button onClick={() => navigate('/org')}>Continue</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: `Review: ${template.name}` }]}>
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        {readTemplate.nudge ?? readTask.nudge}
        {/* Header */}
        <div>
          <h1 className="text-h1 font-medium text-text-primary">{template.name}</h1>
          <p className="text-body text-text-secondary mt-1">{template.description}</p>
        </div>

        {taskId && (
          <div className="text-small text-text-muted bg-surface-2 rounded-lg px-3 py-2">
            Agent-proposed template — review selections and confirm to queue for assembly.
          </div>
        )}

        {/* Teams + Agents */}
        <section className="space-y-3">
          <h2 className="text-h2 font-medium text-text-muted">Teams & Agents</h2>
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
                    onChange={() => edit(sel => toggleTeam(sel, teamSel.name))}
                    className="rounded border-border bg-transparent accent-accent cursor-pointer"
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
                  const problem = problems[`${teamSel.name}/${agentSel.handle}`]?.why
                  const wasRenamed = agentSel.include && agentSel.handle !== agentSel.resolvedHandle
                  return (
                    <div key={agentSel.handle} className="border-t border-border-subtle">
                      <div className="flex items-start gap-3 px-4 py-2.5 pl-8">
                        <input
                          type="checkbox"
                          checked={agentSel.include}
                          disabled={!teamSel.include}
                          onChange={() => edit(sel => toggleAgent(sel, teamSel.name, agentSel.handle))}
                          className="mt-0.5 rounded border-border bg-transparent accent-accent cursor-pointer disabled:opacity-40"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body text-text-primary">{agentSpec?.name}</span>
                            <span className="text-small text-text-muted">{agentSpec?.role}</span>
                            {problem && (
                              <span className="flex items-center gap-1 text-small text-warning">
                                <AlertTriangle className="w-3 h-3" />
                                {problem}
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
                              onChange={(e) => edit(sel => setResolvedHandle(sel, teamSel.name, agentSel.handle, e.target.value))}
                              className={`text-small rounded px-2 py-0.5 w-32 ${FIELD_LOOK}`}
                            />
                            {wasRenamed && (
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
                                      onChange={() => edit(sel => toggleSkill(sel, teamSel.name, agentSel.handle, skillSel.slug))}
                                      className="rounded border-border bg-transparent accent-accent cursor-pointer disabled:opacity-40"
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
          <h2 className="text-h2 font-medium text-text-muted">Projects</h2>
          {selections.projects.map((projectSel) => {
            const projectSpec = content.projects.find((p) => p.name === projectSel.name)
            return (
              <div key={projectSel.name} className="border border-border rounded-lg px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={projectSel.include}
                    onChange={() => edit(sel => toggleProject(sel, projectSel.name))}
                    className="rounded border-border bg-transparent accent-accent cursor-pointer"
                  />
                  <span className="text-body font-medium text-text-primary">{projectSel.name}</span>
                  <span className="text-small text-text-muted">{projectSpec?.description}</span>
                </div>
                {projectSpec && <ProjectTypesLine project={projectSpec} />}
              </div>
            )
          })}
        </section>

        {/* Errors */}
        {error && (
          <ShowAttention kind="alert" text={error} title="The workforce was not saved" onClose={() => setError(null)} />
        )}

        {/* Action */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            {taskId && (
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={!selections || saving || applying}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Progress
              </Button>
            )}
            {savedAt && !saving && (
              <span className="text-small text-text-muted">Saved {savedAt.toLocaleTimeString()}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-small text-text-muted">
              {hasProblem ? 'Some handles cannot be used — change them before applying.' : 'All handles are available.'}
            </span>
            <Button
              onClick={handleApply}
              disabled={!canApply}
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {taskId ? 'Confirm & Apply' : 'Apply Template'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

/** What the project starts with beside Task and Epic: its task types and custom fields. */
function ProjectTypesLine({ project }: { project: ProjectSpec }) {
  const parts = [
    project.types.length > 0 ? `Task types: ${project.types.map(t => t.name).join(', ')}` : null,
    project.fields.length > 0 ? `Fields: ${project.fields.map(f => f.name).join(', ')}` : null,
  ].filter((p): p is string => p !== null)
  return <p className="pl-7 text-micro text-text-muted">{parts.length > 0 ? parts.join(' · ') : 'Task and Epic only'}</p>
}
