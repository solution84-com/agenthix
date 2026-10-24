import { useState } from 'react'
import { useQuery, useAction, getProjects, getOrgPeople, allowGitHubAccount, changeGitHubAccountRule } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { ErrorLine } from '../../workflows/components/ErrorLine'
import { SearchableChecklist } from './SearchableChecklist'
import type { AccountRow } from './githubWords'

type Rule = { projectRule: 'EVERY_PROJECT' | 'CHOSEN_PROJECTS'; projectIds: string[]; userIds: string[] }

/**
 * Allow a GitHub account, or change which places may connect to it (G1, part 4), in two parts: shared projects (every
 * one, or chosen ones) and people, whose own storage and personal projects are included only when they are chosen.
 */
export function AllowDialog({ account, mode, onClose, onDone }: {
  account: AccountRow
  mode: 'allow' | 'change'
  onClose: () => void
  onDone: () => void
}) {
  const { data: projects } = useQuery(getProjects)
  const { data: people } = useQuery(getOrgPeople)
  const allow = useAction(allowGitHubAccount)
  const change = useAction(changeGitHubAccountRule)
  const [rule, setRule] = useState<Rule>(mode === 'change'
    ? { projectRule: account.projectRule as Rule['projectRule'], projectIds: account.projectIds, userIds: account.userIds }
    : { projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const shared = (projects ?? []).filter((p) => !p.personalOwnerId).map((p) => ({ id: p.id, name: p.name }))
  const active = (people?.people ?? []).filter((r) => r.person.state === 'active').map((r) => ({ id: r.person.userId, name: r.person.name }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await (mode === 'allow' ? allow : change)({ id: account.id, ...rule })
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const choice = (on: boolean) => `block cursor-pointer rounded-lg border p-3 ${on ? 'border-border-strong bg-accent-subtle' : 'border-border'}`
  const title = mode === 'allow' ? `Allow ${account.login}?` : `Who can connect to ${account.login}`
  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-3xl">
      <div className="max-h-[75vh] space-y-6 overflow-y-auto" data-testid="allow-dialog">
        <p className="text-small text-text-secondary">
          {mode === 'allow' ? 'Only allow a GitHub account you expected. Then say who can connect their workspaces to it.' : 'A workspace connected before keeps its repository; a new connection must pass this rule.'}
        </p>
        <section className="space-y-2">
          <h3 className="text-body font-semibold text-text-primary">Projects</h3>
          <p className="text-small text-text-muted">The organisation's shared projects. People's personal projects are under People.</p>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Projects</legend>
            <label className={choice(rule.projectRule === 'EVERY_PROJECT')}>
              <input type="radio" name="rule" className="mr-2" checked={rule.projectRule === 'EVERY_PROJECT'} onChange={() => setRule({ ...rule, projectRule: 'EVERY_PROJECT', projectIds: [] })} />
              <span className="text-small font-semibold text-text-primary">Every project</span>
              <span className="mt-1 block text-small text-text-muted">For your own organisations</span>
            </label>
            <label className={choice(rule.projectRule === 'CHOSEN_PROJECTS')}>
              <input type="radio" name="rule" className="mr-2" checked={rule.projectRule === 'CHOSEN_PROJECTS'} onChange={() => setRule({ ...rule, projectRule: 'CHOSEN_PROJECTS' })} />
              <span className="text-small font-semibold text-text-primary">Only chosen projects</span>
              <span className="mt-1 block text-small text-text-muted">For a client's organisation, so other clients' projects can't reach it</span>
            </label>
          </fieldset>
          {rule.projectRule === 'CHOSEN_PROJECTS' && (
            <SearchableChecklist label="Projects" items={shared} chosen={rule.projectIds} onChange={(projectIds) => setRule({ ...rule, projectIds })} empty="There are no shared projects yet." />
          )}
        </section>
        <section className="space-y-2">
          <h3 className="text-body font-semibold text-text-primary">People</h3>
          <p className="text-small text-text-muted">
            None by default. A chosen person can connect their own work to {account.login}: their own storage and their personal projects. No one else's.
          </p>
          <SearchableChecklist label="People" items={active} chosen={rule.userIds} onChange={(userIds) => setRule({ ...rule, userIds })} empty="There are no active members." />
        </section>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || (rule.projectRule === 'CHOSEN_PROJECTS' && rule.projectIds.length === 0 && rule.userIds.length === 0)}>
            {mode === 'allow' ? 'Allow' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
