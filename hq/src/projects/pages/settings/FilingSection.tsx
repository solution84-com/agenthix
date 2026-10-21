import { useAction, useQuery, updateProject, getProducts, getPrograms } from 'wasp/client/operations'
import { NativeSelect } from '../../../shared/components/ui/NativeSelect'
import { Part, ReadOnlyValue } from './Part'
import { usePartSave } from './usePartSave'
import type { SettingsProject } from './types'

type Named = { id: string; name: string }

function FilingPick({ label, id, current, options, onPick }: {
  label: string; id: string; current: string; options: Named[]; onPick: (next: string | null) => Promise<unknown>
}) {
  const save = usePartSave()
  return (
    <Part label={label} htmlFor={id} save={save}>
      <NativeSelect id={id} value={current} disabled={save.state === 'saving'} onChange={e => void save.save(() => onPick(e.target.value || null))}>
        <option value="">None</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </NativeSelect>
    </Part>
  )
}

/**
 * Filing a project under a product or programme is the organisation admins'
 * (ADR-0061), saved on its own so a project admin's edits never carry it.
 */
export function FilingSection({ project, canEdit }: { project: SettingsProject; canEdit: boolean }) {
  const update = useAction(updateProject)
  const { data: products } = useQuery(getProducts, undefined, { enabled: canEdit })
  const { data: programs } = useQuery(getPrograms, undefined, { enabled: canEdit })

  if (!canEdit) {
    return (
      <>
        <Part label="Product" htmlFor="set-product"><ReadOnlyValue id="set-product">{project.product?.name ?? 'None'}</ReadOnlyValue></Part>
        <Part label="Programme" htmlFor="set-program"><ReadOnlyValue id="set-program">{project.program?.name ?? 'None'}</ReadOnlyValue></Part>
      </>
    )
  }
  const productOptions = (products ?? []) as Named[]
  const programOptions = (programs ?? []) as Named[]
  return (
    <>
      {productOptions.length > 0 && (
        <FilingPick
          label="Product" id="set-product" current={project.productId ?? ''} options={productOptions}
          onPick={productId => update({ projectId: project.id, productId })}
        />
      )}
      {programOptions.length > 0 && (
        <FilingPick
          label="Programme" id="set-program" current={project.programId ?? ''} options={programOptions}
          onPick={programId => update({ projectId: project.id, programId })}
        />
      )}
    </>
  )
}
