import type { TaskTemplateContent, TaskTemplateField, TaskTemplateType } from '@agenthix/core'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import { StateColumnsInline } from '../../projects/components/TypeStateColumns'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A field's options as neutral chips, as a field's options are shown elsewhere. */
export function OptionChips({ options }: { options: readonly { name: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map(o => <span key={o.name} className="rounded-full bg-chip px-2 text-micro font-medium leading-[18px] text-text-secondary">{o.name}</span>)}
    </span>
  )
}

/** One of a template's types: its mark and name, then its columns under the task state each sits in. */
export function TemplateTypeLine({ type, note }: { type: TaskTemplateType; note?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <TaskTypeMark type={type} variant="tile" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-body text-text-primary"><span className="font-medium">{type.name}</span> <span className="text-small text-text-muted">{note ?? `${plural(type.columns.length, 'column', 'columns')}, each in a task state`}</span></p>
        <StateColumnsInline columns={type.columns} />
      </div>
    </div>
  )
}

/** One of a template's fields: its name, its kind and how many options, then the options. */
export function TemplateFieldLine({ field, note }: { field: TaskTemplateField; note?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-body text-text-primary"><span className="font-medium">{field.name}</span> <span className="text-small text-text-muted">{note ?? `Single select · ${plural(field.options.length, 'option', 'options')}`}</span></p>
      <OptionChips options={field.options} />
    </div>
  )
}

export const holdsCountWords = (holds: TaskTemplateContent) =>
  [holds.types.length ? plural(holds.types.length, 'type', 'types') : '', holds.fields.length ? plural(holds.fields.length, 'field', 'fields') : ''].filter(Boolean).join(' · ')

/** What a task template holds (spec D16): its types with their columns, then its fields with their options. */
export function TaskTemplateHolds({ holds }: { holds: TaskTemplateContent }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-4" aria-label="What it holds" data-testid="task-template-holds">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="text-body font-medium text-text-primary">What it holds</h2>
        <span className="text-small text-text-muted">{holdsCountWords(holds)}</span>
      </header>
      <div className="space-y-4">
        {holds.types.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Task types · {holds.types.length}</h3>
            {holds.types.map(t => <TemplateTypeLine key={t.name} type={t} />)}
          </div>
        )}
        {holds.fields.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Custom fields · {holds.fields.length}</h3>
            {holds.fields.map(f => <TemplateFieldLine key={f.name} field={f} />)}
          </div>
        )}
      </div>
      <p className="mt-3 text-small text-text-muted">Adding it copies these into a project. It brings no tasks, boards or skills.</p>
    </section>
  )
}
