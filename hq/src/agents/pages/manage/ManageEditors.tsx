import {
  useQuery, useAction,
  updateAgent as updateAgentAction, updateAgentSettings, getUserSettings, getAgentPromptPreview, updateAgentFile,
  getAgentSkills, getSkillLibrary, getInstalledSkillVersions, saveAgentSkill, deleteAgentSkill, installSkill,
} from 'wasp/client/operations'
import {
  PromptTab, SkillsTab, ConfigurationTab, type AgentDetail,
} from '@agenthix/ui/agents'
import { RichTextEditor } from '../../../shared/components/ui/RichTextEditor'
import { MarkdownMessage } from '../../../shared/components/MarkdownMessage'
import { AgentModelsSection } from '../../../models-settings/components/AgentModelsSection'
import { resolveAgentSave, type AgentBehaviourFields } from '../agentSaveGate'
import { ManageSection } from './ManageSection'
import { PermissionsSection } from './PermissionsSection'

const slots = {
  renderEditor: (p: { value: string; onChange: (v: string) => void; placeholder?: string }) => <RichTextEditor {...p} />,
  renderMarkdown: (p: { content: string; className?: string }) => <MarkdownMessage content={p.content} className={p.className} />,
}

const lines = (text: string, n: number) => text.split('\n').filter(l => l.trim()).slice(0, n).join('\n')

function InstructionsSection({ agent }: { agent: AgentDetail }) {
  const updateFile = useAction(updateAgentFile)
  const { data } = useQuery(getAgentPromptPreview, { agentId: agent.id, mode: 'chat' })
  const text = (data?.sections as { key: string; content: string }[] | undefined)?.find(s => s.key === 'instructions')?.content ?? ''
  return (
    <ManageSection
      title="Instructions"
      summary={text ? <p className="line-clamp-4 whitespace-pre-line">{lines(text, 4)}</p> : <span className="text-text-muted">None yet.</span>}
      editor={
        <PromptTab
          agent={agent}
          queries={{ getAgentPromptPreview: ((i: { agentId: string; mode: 'chat' | 'task' }) => getAgentPromptPreview(i).then((r) => ({ sections: (r.sections ?? []) as never }))) as never }}
          actions={{ updateAgentFile: (i) => updateFile(i as never) }}
          slots={slots}
        />
      }
    />
  )
}

function SkillsSection({ agent }: { agent: AgentDetail }) {
  const save = useAction(saveAgentSkill)
  const remove = useAction(deleteAgentSkill)
  const install = useAction(installSkill)
  const { data } = useQuery(getAgentSkills, { agentId: agent.id })
  const names = ((data ?? []) as { name?: string; slug?: string }[]).map(s => s.name ?? s.slug).filter(Boolean)
  return (
    <ManageSection
      title="Skills"
      editLabel="Add"
      summary={names.length ? names.join(' · ') : <span className="text-text-muted">None.</span>}
      editor={
        <SkillsTab
          agent={agent}
          queries={{ getAgentSkills, getSkillLibrary, getInstalledSkillVersions } as never}
          actions={{ saveAgentSkill: save, deleteAgentSkill: remove, installSkill: install } as never}
        />
      }
    />
  )
}

function SettingsSection({ agent }: { agent: AgentDetail }) {
  const updateSettings = useAction(updateAgentSettings)
  const updateAgent = useAction(updateAgentAction)

  // Read fresh at save time, as the page this came from did, so a save right after opening is never wrongly refused.
  const saveAgent = async (input: { id: string; name?: string } & Record<string, unknown>) => {
    const { id, name, ...change } = input
    const settings = await getUserSettings()
    const decision = resolveAgentSave(change as AgentBehaviourFields, agent, settings.role === 'ADMIN')
    if (decision.kind === 'refused') throw new Error(decision.message)
    if (name !== undefined) await updateAgent({ id, name })
    if (decision.kind === 'save') return updateSettings({ agentId: id, ...decision.change } as never)
  }
  return (
    <ManageSection
      title="Settings"
      summary={
        <span>@{agent.handle} · Approval {agent.approval}</span>
      }
      editor={
        <div className="space-y-8">
          <ConfigurationTab agent={agent} actions={{ updateAgent: saveAgent as never }} />
        </div>
      }
    />
  )
}

/** Instructions, Skills, Models, Settings and Permissions (spec §3), each its editor behind an Edit. */
export function ManageEditors({ agent }: { agent: AgentDetail }) {
  return (
    <>
      <InstructionsSection agent={agent} />
      <SkillsSection agent={agent} />
      <AgentModelsSection agentId={agent.id} agentName={agent.name} />
      <SettingsSection agent={agent} />
      <PermissionsSection agent={agent} />
    </>
  )
}
