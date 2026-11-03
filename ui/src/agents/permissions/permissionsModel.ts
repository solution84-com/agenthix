/**
 * The permissions view's working copy and the rules on it (every screen reviewed spec §3, *An agent's
 * permissions*): one shape at every level. The organisation's can be set to anything; a project's or a person's
 * can only take away, so each line has a limit — the loosest state it is offered — and the draft never goes past it.
 */
import { APPROVALS, APPROVAL_WORDS } from '../projectAgentTypes'
import { PERMISSION_PRESETS, type PermissionPreset } from '../tabs/permissionPresets'
import type {
  ApprovalId, OrganisationPermissionsData, PermissionsHereData, PermissionsSave, ToolGroupId, ToolState,
} from './permissionsTypes'

export const STATES: readonly ToolState[] = ['always', 'ask', 'never']

/** The states a line is offered: its limit and every stricter one. */
export const offeredStates = (limit: ToolState): ToolState[] => STATES.slice(STATES.indexOf(limit))
export const stricterState = (a: ToolState, b: ToolState): ToolState => (STATES.indexOf(a) >= STATES.indexOf(b) ? a : b)
export const isStricterState = (a: ToolState, than: ToolState): boolean => STATES.indexOf(a) > STATES.indexOf(than)

export const offeredApprovals = (limit: ApprovalId): ApprovalId[] => APPROVALS.slice(APPROVALS.indexOf(limit))

export type DraftTool = { name: string; group: ToolGroupId; fixed: boolean; limit: ToolState; state: ToolState }
export type DraftPattern = { pattern: string; limit: ToolState; state: ToolState; /** Added at this level; the organisation has no such pattern. */ added: boolean }

export type PermissionsDraft = {
  level: 'organisation' | 'narrowing'
  /** The organisation's approval, shown under the choices below it; null at the organisation. */
  organisationApproval: ApprovalId | null
  approvalLimit: ApprovalId
  approval: ApprovalId
  organisationBypassed: boolean
  tools: DraftTool[]
  patterns: DraftPattern[]
}

const asApproval = (value: string): ApprovalId => ((APPROVALS as readonly string[]).includes(value) ? value as ApprovalId : 'deferred')

export function organisationDraft(data: OrganisationPermissionsData): PermissionsDraft {
  return {
    level: 'organisation',
    organisationApproval: null,
    approvalLimit: 'bypassed',
    approval: asApproval(data.approval),
    organisationBypassed: false,
    tools: data.tools.map(t => ({ name: t.name, group: t.group, fixed: t.fixed, limit: 'always', state: t.state })),
    patterns: data.bashPatterns.map(p => ({ pattern: p.pattern, limit: 'always', state: p.state, added: false })),
  }
}

export function narrowingDraft(data: PermissionsHereData): PermissionsDraft {
  const orgApproval = asApproval(data.approval.organisation)
  return {
    level: 'narrowing',
    organisationApproval: orgApproval,
    approvalLimit: orgApproval,
    approval: asApproval(data.approval.effective),
    organisationBypassed: data.organisationBypassed,
    tools: data.tools.map(t => ({ name: t.name, group: t.group, fixed: t.fixed, limit: t.organisation, state: t.effective })),
    patterns: data.bashPatterns.map(p => ({ pattern: p.pattern, limit: p.organisation, state: p.effective, added: false })),
  }
}

/** Approval Bypassed runs every tool and asks no one, so the tool list is not used (and not shown). */
export const toolsShown = (d: PermissionsDraft): boolean => d.approval !== 'bypassed'

export function narrowedTools(d: PermissionsDraft): DraftTool[] {
  return d.tools.filter(t => !t.fixed && isStricterState(t.state, t.limit))
}
export function narrowedPatterns(d: PermissionsDraft): DraftPattern[] {
  return d.patterns.filter(p => isStricterState(p.state, p.limit))
}

/** How many tools, patterns and approval this level makes stricter than the organisation's. Only a narrowing has any. */
export function narrowedCount(d: PermissionsDraft): number {
  if (d.level === 'organisation') return 0
  const approvalNarrowed = APPROVALS.indexOf(d.approval) > APPROVALS.indexOf(d.approvalLimit)
  // While the run is bypassed nothing below approval takes effect, so nothing below is counted.
  const below = toolsShown(d) ? narrowedTools(d).length + narrowedPatterns(d).length : 0
  return (approvalNarrowed ? 1 : 0) + below
}

export function setApproval(d: PermissionsDraft, approval: ApprovalId): PermissionsDraft {
  return { ...d, approval }
}

export function setToolState(d: PermissionsDraft, name: string, state: ToolState): PermissionsDraft {
  return { ...d, tools: d.tools.map(t => (t.name === name && !t.fixed ? { ...t, state: stricterState(state, t.limit) } : t)) }
}

export function setGroupState(d: PermissionsDraft, group: ToolGroupId, state: ToolState): PermissionsDraft {
  return { ...d, tools: d.tools.map(t => (t.group === group && !t.fixed ? { ...t, state: stricterState(state, t.limit) } : t)) }
}

export function setPatternState(d: PermissionsDraft, pattern: string, state: ToolState): PermissionsDraft {
  return { ...d, patterns: d.patterns.map(p => (p.pattern === pattern ? { ...p, state: stricterState(state, p.limit) } : p)) }
}

export function removePattern(d: PermissionsDraft, pattern: string): PermissionsDraft {
  return { ...d, patterns: d.patterns.filter(p => p.pattern !== pattern || (d.level === 'narrowing' && !p.added)) }
}

/**
 * A new pattern. The organisation's runs the command at Always unless said otherwise; below it, a pattern added
 * is a command blocked here, limited by what the organisation allows the Bash tool.
 */
export function addPattern(d: PermissionsDraft, raw: string): PermissionsDraft {
  const pattern = raw.trim()
  if (!pattern || d.patterns.some(p => p.pattern === pattern)) return d
  if (d.level === 'organisation') return { ...d, patterns: [...d.patterns, { pattern, limit: 'always', state: 'always', added: true }] }
  const limit = d.tools.find(t => t.name === 'bash')?.limit ?? 'always'
  return { ...d, patterns: [...d.patterns, { pattern, limit, state: 'never', added: true }] }
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const ORGANISATION_PRESET = 'organisation'
export const CUSTOM_PRESET = 'custom'

/** A tool a preset does not name: a built-in is withheld, a platform tool is asked about (as the gate reads a list). */
const absentState = (group: ToolGroupId): ToolState => (group === 'platform' ? 'ask' : 'never')

const presetState = (preset: PermissionPreset, t: Pick<DraftTool, 'name' | 'group'>): ToolState =>
  (preset.tools.find(p => p.name === t.name)?.state as ToolState | undefined) ?? absentState(t.group)

/** The tools a preset gives, each held to the level's limit: a preset never loosens the organisation's. */
export function applyPreset(d: PermissionsDraft, preset: PermissionPreset): PermissionsDraft {
  const tools = d.tools.map(t => (t.fixed ? t : { ...t, state: stricterState(presetState(preset, t), t.limit) }))
  if (d.level === 'organisation') {
    const patterns = preset.bashPatterns.map(p => ({ pattern: p.pattern, limit: 'always' as const, state: p.state as ToolState, added: false }))
    return { ...d, tools, patterns }
  }
  const patterns = d.patterns.map(p => {
    const given = preset.bashPatterns.find(b => b.pattern.trim() === p.pattern)?.state as ToolState | undefined
    return { ...p, state: given ? stricterState(given, p.limit) : p.limit }
  })
  return { ...d, tools, patterns: patterns.filter(p => !p.added) }
}

/** Undoes every narrowing: the organisation's approval, tools and patterns. */
export function organisationsPreset(d: PermissionsDraft): PermissionsDraft {
  return {
    ...d,
    approval: d.approvalLimit,
    tools: d.tools.map(t => ({ ...t, state: t.limit })),
    patterns: d.patterns.filter(p => !p.added).map(p => ({ ...p, state: p.limit })),
  }
}

export const presetsFor = (d: PermissionsDraft): { id: string; label: string; description?: string }[] => [
  ...(d.level === 'narrowing' ? [{ id: ORGANISATION_PRESET, label: "The organisation's" }] : []),
  ...PERMISSION_PRESETS.map(p => ({ id: p.id, label: p.label, description: p.description })),
  { id: CUSTOM_PRESET, label: 'Custom' },
]

const sameTools = (a: DraftTool[], b: DraftTool[]) => a.every((t, i) => t.fixed || t.state === b[i].state)
const patternKey = (ps: { pattern: string; state: string }[]) => ps.map(p => `${p.pattern.trim()}=${p.state}`).sort().join('|')

/** Which preset the draft is, once a tool or pattern has been changed away from all of them: Custom. */
export function detectPreset(d: PermissionsDraft): string {
  if (d.level === 'narrowing') {
    const none = organisationsPreset(d)
    if (sameTools(d.tools, none.tools) && patternKey(d.patterns) === patternKey(none.patterns)) return ORGANISATION_PRESET
  }
  for (const preset of PERMISSION_PRESETS) {
    const given = applyPreset(d, preset)
    if (sameTools(d.tools, given.tools) && patternKey(d.patterns) === patternKey(given.patterns)) return preset.id
  }
  return CUSTOM_PRESET
}

// ── Saving ────────────────────────────────────────────────────────────────────

/** The organisation's save is the whole list; a narrowing's is only what it makes stricter, null where it leaves the organisation's. */
export function toSave(d: PermissionsDraft): PermissionsSave {
  if (d.level === 'organisation') {
    return {
      approval: d.approval,
      allowedTools: d.tools.filter(t => !t.fixed).map(t => ({ name: t.name, state: t.state })),
      allowedBashPatterns: d.patterns.length > 0 ? d.patterns.map(p => ({ pattern: p.pattern, state: p.state })) : null,
    }
  }
  const tools = narrowedTools(d).map(t => ({ name: t.name, state: t.state }))
  const patterns = narrowedPatterns(d).map(p => ({ pattern: p.pattern, state: p.state }))
  return {
    approval: d.approval === d.approvalLimit ? null : d.approval,
    allowedTools: tools.length > 0 ? tools : null,
    allowedBashPatterns: patterns.length > 0 ? patterns : null,
  }
}

export function isDirty(a: PermissionsDraft, b: PermissionsDraft): boolean {
  return a.approval !== b.approval
    || a.tools.some((t, i) => t.state !== b.tools[i]?.state)
    || patternKey(a.patterns) !== patternKey(b.patterns)
}

// ── Summary ───────────────────────────────────────────────────────────────────

export type SummaryLine = { label: string; text: string }

function counts(tools: DraftTool[]): string {
  const n = (s: ToolState) => tools.filter(t => t.state === s).length
  return STATES.filter(s => n(s) > 0).map(s => `${n(s)} ${s}`).join(' · ') || 'None'
}

/** The organisation's section at a glance: approval, the preset, and one line per group. */
export function summaryLines(d: PermissionsDraft, presetLabel: string): SummaryLine[] {
  const lines: SummaryLine[] = [{ label: 'Approval', text: APPROVAL_WORDS[d.approval] }]
  if (!toolsShown(d)) return [...lines, { label: 'Tools', text: 'Not used while approval is bypassed' }]
  const inGroup = (g: ToolGroupId) => d.tools.filter(t => t.group === g && !t.fixed)
  const platform = inGroup('platform')
  const bash = d.tools.find(t => t.name === 'bash')
  const patterns = d.patterns.length
  return [
    ...lines,
    { label: 'Preset', text: presetLabel },
    { label: 'Files', text: counts(inGroup('files')) },
    { label: 'Commands', text: `${bash ? `Any other command ${bash.state}` : 'None'}${patterns ? ` · ${patterns} ${patterns === 1 ? 'pattern' : 'patterns'}` : ''}` },
    { label: 'Web', text: counts(inGroup('web')) },
    { label: 'Platform', text: `${platform.filter(t => t.state !== 'never').length} of ${platform.length} on` },
  ]
}
