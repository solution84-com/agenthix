import { useRef, type ReactNode } from 'react'
import { Paperclip } from 'lucide-react'
import { NativeSelect, Button, DateField } from '@agenthix/ui/primitives'
import { AgentPicker } from '@agenthix/ui/tasks'
import {
  REPEAT_RULES, showsColumn, showsModel, type BoardChoice, type NewTaskValues, type Repeat,
} from './newTaskState'

const LABEL = 'block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="text-small font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} className={LABEL}>{label}</label>{children}</div>
}

export interface NewTaskDetailsProps {
  values: NewTaskValues
  onChange: (patch: Partial<NewTaskValues>) => void
  agents: { id: string; name: string }[]
  boards: BoardChoice[]
  epics: { id: string; number: number; title: string }[]
  /** The model picker for the chosen agent: the host's, which reads what the project allows. */
  renderModel: (state: { agentId: string; value: string; onChange: (v: string) => void }) => ReactNode
  renderWorkspace: () => ReactNode
}

/** The task page's Details groups, for a task not yet made: Who, Where, When, About. */
export function NewTaskDetails({ values: v, onChange, agents, boards, epics, renderModel, renderWorkspace }: NewTaskDetailsProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const board = boards.find(b => b.id === v.boardId)
  const columns = [...(board?.columns ?? [])].sort((a, b) => a.order - b.order)
  return (
    <div className="space-y-6">
      <Group title="Who">
        <Field label="Agent">
          <AgentPicker currentAgentId={v.agentId || null} agents={agents} onAssign={id => onChange({ agentId: id ?? '' })} />
        </Field>
        {showsModel(v) && renderModel({ agentId: v.agentId, value: v.modelChoice, onChange: modelChoice => onChange({ modelChoice }) })}
      </Group>

      <Group title="Where">
        <Field label="Board" htmlFor="nt-board">
          <NativeSelect id="nt-board" size="sm" value={v.boardId} onChange={e => onChange({ boardId: e.target.value })}>
            <option value="">Backlog (no board)</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </Field>
        {showsColumn(v) && (
          <Field label="Column" htmlFor="nt-column">
            <NativeSelect id="nt-column" size="sm" value={v.column} onChange={e => onChange({ column: e.target.value })}>
              {columns.map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
            </NativeSelect>
          </Field>
        )}
        {renderWorkspace()}
      </Group>

      <Group title="When">
        <Field label="Plan">
          <div className="grid grid-cols-2 gap-2">
            <DateField aria-label="Plan start" title="Plan start" emptyText="Start" value={v.planStart} onChange={e => onChange({ planStart: e.target.value })} />
            <DateField aria-label="Plan finish" title="Plan finish" emptyText="Finish" min={v.planStart || undefined} value={v.planFinish} onChange={e => onChange({ planFinish: e.target.value })} />
          </div>
        </Field>
        <Field label="Start time" htmlFor="nt-starts">
          <DateField id="nt-starts" withTime value={v.startsAt} onChange={e => onChange({ startsAt: e.target.value })} />
        </Field>
        <Field label="Repeat" htmlFor="nt-repeat">
          <NativeSelect id="nt-repeat" size="sm" value={v.repeat} onChange={e => onChange({ repeat: e.target.value as Repeat })}>
            <option value="">Does not repeat</option>
            {Object.entries(REPEAT_RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </NativeSelect>
        </Field>
      </Group>

      <Group title="About">
        <Field label="Priority" htmlFor="nt-priority">
          <NativeSelect id="nt-priority" size="sm" value={v.priority} onChange={e => onChange({ priority: e.target.value })}>
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Epic" htmlFor="nt-epic">
          <NativeSelect id="nt-epic" size="sm" value={v.epicId} onChange={e => onChange({ epicId: e.target.value })}>
            <option value="">None</option>
            {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </NativeSelect>
        </Field>
        <div>
          <span className={LABEL}>Files</span>
          <ul className="mb-1.5 space-y-1">
            {v.files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-small text-text-secondary">
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} className="text-text-muted hover:text-text-primary"
                  onClick={() => onChange({ files: v.files.filter((_, j) => j !== i) })}>Remove</button>
              </li>
            ))}
          </ul>
          <input ref={fileInput} type="file" multiple hidden aria-label="Choose files"
            onChange={e => { onChange({ files: [...v.files, ...Array.from(e.target.files ?? [])] }); e.target.value = '' }} />
          <Button type="button" variant="secondary" leadingIcon={<Paperclip size={14} aria-hidden />} onClick={() => fileInput.current?.click()}>Attach files</Button>
        </div>
      </Group>
    </div>
  )
}
