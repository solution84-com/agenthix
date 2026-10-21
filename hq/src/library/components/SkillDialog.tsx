import { useState } from 'react'
import { useQuery, useAction, getSkillLibrary, getOrg, getUserSettings, deleteLibrarySkill, installSkill } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { LibraryItem } from '../packages/packageActions'
import { SkillEditor, SkillViewer, SKILL_TEMPLATE, type LibrarySkill } from './SkillParts'

type Editing = { id?: string; slug: string; name: string; description: string; content: string }

/**
 * A skill in the library, opened (every screen reviewed spec §3): its content, and for organisation admins, Install,
 * Edit and Delete — as the server's org-admin rule allows. A new skill is the same dialog with an empty form.
 */
export function SkillDialog({ item, creating, onClose, onChanged }: { item: LibraryItem | null; creating: boolean; onClose: () => void; onChanged: () => void }) {
  const open = item !== null || creating
  const { data: me } = useQuery(getUserSettings)
  const { data: org } = useQuery(getOrg)
  const isAdmin = me?.role === 'ADMIN'
  const orgId = (org as { id?: string } | undefined)?.id
  const platform = item?.source === 'BUILT_IN'
  const { data: skills } = useQuery(getSkillLibrary, platform ? { scope: 'PLATFORM' } : { scope: 'ORG', orgId }, { enabled: item !== null && (platform || !!orgId) })
  const skill = ((skills ?? []) as LibrarySkill[]).find(s => s.id === item?.id)
  const remove = useAction(deleteLibrarySkill)
  const install = useAction(installSkill)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState('')

  const close = () => { setEditing(null); setError(''); onClose() }
  const done = () => { setEditing(null); onChanged(); if (creating) onClose() }
  const attempt = async (work: () => Promise<unknown>) => {
    setError('')
    try { await work() } catch (err) { setError(err instanceof Error ? err.message : 'That did not work') }
  }

  return (
    <Modal open={open} onClose={close} title={creating ? 'New skill' : item?.name ?? 'Skill'} maxWidth="max-w-3xl">
      <div className="max-h-[70vh] overflow-y-auto">
        {creating || editing ? (
          <SkillEditor
            initial={editing ?? { slug: '', name: '', description: '', content: SKILL_TEMPLATE('New Skill') }}
            orgId={orgId}
            scope="ORG"
            onSave={done}
            onCancel={creating ? close : () => setEditing(null)}
          />
        ) : skill ? (
          <SkillViewer
            skill={skill}
            readonly={!isAdmin}
            onEdit={platform ? undefined : () => setEditing({ id: skill.id, slug: skill.slug, name: skill.name, description: skill.description, content: skill.content })}
            onDelete={platform ? undefined : () => void attempt(async () => { await remove({ id: skill.id }); onChanged(); close() })}
            onInstall={orgId ? () => void attempt(() => install({ skillId: skill.id, target: { scope: 'ORG', orgId } })) : undefined}
            installLabel={platform ? 'Install to Org' : 'Install to Org Active'}
          />
        ) : (
          <p className="p-6 text-body text-text-muted">Loading…</p>
        )}
        {error && <p role="alert" className="px-6 pb-2 text-small text-danger">{error}</p>}
      </div>
      {!creating && !editing && <div className="mt-3 flex justify-end"><Button variant="ghost" onClick={close}>Close</Button></div>}
    </Modal>
  )
}
