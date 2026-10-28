import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  useQuery, getPlaceSkills, getYourSkillsHere, getWorkspacesAcrossPlaces, scanPlaceSkills, switchPlaceSkill, switchAllPlaceSkills,
  publishPlaceSkillFiles, putBackPlaceSkillVersion, removePlaceSkill,
} from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { SPACE_PATH } from '../../../chat/chatPlacePaths'
import { useAct } from './useAct'
import { newPlaceSkillPath } from './placeSkillRoutes'
import {
  countsLine, groupFolders, groupSkills, pageCounts, skillTitle,
  type PlaceSkillsData, type PlaceSkillView, type SkillGroup,
} from './placeSkillsModel'
import { PlaceSkillRow, type RowHandlers } from './PlaceSkillRow'
import { SkillFilesDialog, type FilesMode } from './SkillFilesDialog'
import { SkillHistoryDialog } from './SkillHistoryDialog'
import { PlaceDefaultSetting } from './PlaceDefaultSetting'
import { ConfirmRemove, ConfirmSwitchAll } from './PlaceSkillConfirms'
import { AddToPlaceDialog } from './AddToPlaceDialog'
import { LibraryUpdateDialog } from './LibraryUpdateDialog'
import { ProjectProposalsWaiting } from '../review/ProposalsWaiting'
import { WhereLine, YoursBanner, YoursInProject, type YoursView } from './YoursGroup'

export type SkillsPlace = {
  projectId: string
  name: string
  /** Your space, whose page also holds the person's skills that follow them. */
  isSpace: boolean
  agents: { id: string; name: string }[]
}

type Dialog =
  | { kind: 'files'; skill: PlaceSkillView; mode: FilesMode }
  | { kind: 'history'; skill: PlaceSkillView }
  | { kind: 'add' }
  | { kind: 'confirmAll'; on: boolean; group?: SkillGroup }
  | { kind: 'remove'; skill: PlaceSkillView }
  | { kind: 'update'; skill: PlaceSkillView }

const GROUP_TITLE_SPACE = { PLACE: 'For every agent', AGENT: 'For', WORKSPACE: 'Workspace' } as const

/** The Skills page of a project or of Your space (skills spec part 6; boards P1, P2). */
export function PlaceSkillsTool({ place }: { place: SkillsPlace }) {
  const { projectId, isSpace } = place
  const { data, error, isLoading } = useQuery(getPlaceSkills, { projectId }, { retry: retryUnlessDenied })
  const view = data as PlaceSkillsData | undefined
  const { data: yoursData } = useQuery(getYourSkillsHere, { projectId }, { retry: false })
  const yours = yoursData as YoursView | undefined
  const { data: workspaceData } = useQuery(getWorkspacesAcrossPlaces, undefined, { retry: false })
  const workspaceNames = useMemo(
    () => new Map((workspaceData?.workspaces ?? []).map((w) => [w.id, w.name] as const)),
    [workspaceData],
  )
  const { busy, error: actError, run, clear } = useAct()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  const agentIds = place.agents.map((a) => a.id).join(',')
  const scanned = useRef<string | null>(null)
  const scan = async () => {
    setScanNote(null)
    const agentList = place.agents.slice(0, 20)
    try {
      await scanPlaceSkills({ projectId })
      for (const a of agentList) await scanPlaceSkills({ projectId, agentId: a.id })
    } catch (e) {
      setScanNote(e instanceof Error ? e.message : "HQ couldn't look at the files just now.")
    }
  }
  // The page looks at the place's files once when it opens; a person can ask again.
  useEffect(() => {
    if (!view || scanned.current === `${projectId}:${agentIds}`) return
    scanned.current = `${projectId}:${agentIds}`
    if (view.defaults.effective !== 'NEVER') void scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!view, projectId, agentIds])

  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !view) {
    return <p role="alert" className="px-4 py-6 text-small text-text-muted">There is nothing here for you to act on. A project's skills are for the people in the project.</p>
  }

  const counts = pageCounts(view.skills)
  const groups = groupSkills(view.skills)
  const effective = view.defaults.effective
  const liveSkills = view.skills.filter((s) => !s.gone && !s.setAsideReason && s.fingerprint)
  const nameOf = (g: SkillGroup) =>
    g.kind === 'PLACE' ? (isSpace ? GROUP_TITLE_SPACE.PLACE : 'This place · every agent')
      : g.kind === 'AGENT' ? `${place.agents.find((a) => a.id === g.agentId)?.name ?? 'One agent'} only`
        : `Workspace ${workspaceNames.get(g.workspaceId ?? '') ?? 'repository'}`

  const switchTo = (s: PlaceSkillView, on: boolean) => {
    if (!s.fingerprint) return
    if (on) {
      setDialog({ kind: 'files', skill: s, mode: { kind: 'switchOn', confirm: (fingerprint) => switchPlaceSkill({ placeSkillId: s.id, on: true, fingerprint }) } })
    } else {
      void run(() => switchPlaceSkill({ placeSkillId: s.id, on: false, fingerprint: s.fingerprint! }))
    }
  }
  const switchMany = async (on: boolean, group?: SkillGroup) => {
    const skills = (group ? group.skills : view.skills).filter((s) => !s.gone && !s.setAsideReason && s.fingerprint && (on ? s.state === 'off' : s.state === 'on'))
    const seen = Object.fromEntries(skills.map((s) => [s.id, s.fingerprint!]))
    await run(() => switchAllPlaceSkills({
      projectId, on, seen,
      ...(group ? { group: group.kind, agentId: group.agentId ?? undefined, workspaceId: group.workspaceId ?? undefined } : {}),
    }))
    setDialog(null)
  }
  const handlers: RowHandlers = {
    onSwitch: switchTo,
    onRead: (s) => setDialog({ kind: 'files', skill: s, mode: { kind: 'read' } }),
    onChanges: (s) => setDialog({ kind: 'files', skill: s, mode: { kind: 'changes' } }),
    onPublish: (s) => setDialog({
      kind: 'files', skill: s,
      mode: { kind: 'publish', version: (s.newestVersion ?? 0) + 1, confirm: (fingerprint, note) => publishPlaceSkillFiles({ placeSkillId: s.id, fingerprint, note }) },
    }),
    onPutBack: (s) => setDialog({
      kind: 'files', skill: s,
      mode: { kind: 'putBack', version: s.newestVersion ?? 0, confirm: (fingerprint) => putBackPlaceSkillVersion({ placeSkillId: s.id, fingerprint }) },
    }),
    onHistory: (s) => setDialog({ kind: 'history', skill: s }),
    onRemove: (s) => setDialog({ kind: 'remove', skill: s }),
    onUpdate: (s) => setDialog({ kind: 'update', skill: s }),
  }

  const canAct = view.may.settings

  return (
    <div className="px-4 py-4" data-testid="place-skills">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-h2 font-semibold text-text-primary">{isSpace ? 'Your skills' : 'Skills'}</h2>
          <p className="text-small text-text-secondary">{isSpace ? 'Your own way of working.' : "Skills agents find in this project's files and repositories."}</p>
          <p className="text-small text-text-muted" data-testid="place-skills-counts">{countsLine(counts)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAct && <Button size="sm" variant="secondary" disabled={busy || effective === 'NEVER'} onClick={() => setDialog({ kind: 'confirmAll', on: true })}>All on</Button>}
          {canAct && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog({ kind: 'confirmAll', on: false })}>All off</Button>}
          {view.may.editDraft && <Link to={newPlaceSkillPath(projectId)} className="rounded-button border border-border bg-button-secondary px-2.5 py-1 text-micro font-button text-text-primary hover:bg-surface-hover">New skill</Link>}
          {view.may.install && <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>{isSpace ? 'Add' : 'Add to this place'}</Button>}
        </div>
      </header>

      {!isSpace && <ProjectProposalsWaiting projectId={projectId} />}
      {isSpace && yours && <div className="mt-3"><YoursBanner outside={yours.outsideYourSpace} /></div>}
      <p className="mt-3 text-small text-text-muted">
        {isSpace
          ? 'You edit, publish and switch these skills: Your space is yours.'
          : 'Anyone who can write the project\'s files edits these skills. The project\'s administrators publish and switch them. Viewers read.'}
      </p>
      <PlaceDefaultSetting projectId={projectId} effective={effective} org={view.defaults.orgDefault} placeDefault={view.defaults.placeDefault} canChange={canAct} />

      {actError && <p role="alert" className="mt-2 text-small text-danger">{actError} <button type="button" className="underline" onClick={clear}>Dismiss</button></p>}
      {scanNote && <p role="status" className="mt-2 text-small text-text-muted">{scanNote}</p>}
      <div className="mt-2"><button type="button" className="text-small text-accent hover:text-accent-hover" onClick={() => void scan()}>Look at the files again</button></div>

      {groups.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
          {effective === 'NEVER' ? "Skills in files aren't read here." : 'No skills found in this place yet.'}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.key} className="mt-6" aria-label={nameOf(g)} data-testid="place-skill-group">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-body font-semibold text-text-primary">{nameOf(g)}</h3>
            <span className="min-w-0 flex-1 truncate font-mono text-small text-text-muted">{groupFolders(g.kind, g.agentId)}</span>
            {canAct && (
              <span className="flex gap-2 text-small">
                <button type="button" className="text-accent hover:text-accent-hover disabled:opacity-40" disabled={busy || effective === 'NEVER'} onClick={() => setDialog({ kind: 'confirmAll', on: true, group: g })}>All on</button>
                <button type="button" className="text-accent hover:text-accent-hover disabled:opacity-40" disabled={busy} onClick={() => setDialog({ kind: 'confirmAll', on: false, group: g })}>All off</button>
              </span>
            )}
          </div>
          <div>
            {g.skills.map((s) => (
              <div key={s.id}>
                <PlaceSkillRow skill={s} may={view.may} busy={busy} handlers={handlers} />
                {isSpace && (yours?.skills.find((y) => y.id === s.id)?.follows ? <p className="-mt-2 pb-2 text-small text-text-muted">Follows you.</p> : null)}
                {isSpace && yours?.skills.find((y) => y.id === s.id) && <div className="-mt-2 pb-2"><WhereLine skill={yours.skills.find((y) => y.id === s.id)!} /></div>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!isSpace && yours && <YoursInProject yours={yours} manageHref={`${SPACE_PATH}?tool=skills`} />}

      {dialog?.kind === 'files' && (
        <SkillFilesDialog placeSkillId={dialog.skill.id} name={skillTitle(dialog.skill)} mode={dialog.mode} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'update' && (
        <LibraryUpdateDialog placeSkillId={dialog.skill.id} name={skillTitle(dialog.skill)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'history' && (
        <SkillHistoryDialog placeSkillId={dialog.skill.id} name={skillTitle(dialog.skill)} mayRollBack={view.may.rollBack} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'add' && <AddToPlaceDialog projectId={projectId} placeName={place.name} agents={place.agents} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'confirmAll' && (
        <ConfirmSwitchAll
          on={dialog.on} group={dialog.group} names={(dialog.group ? dialog.group.skills : liveSkills).filter((s) => !s.gone && !s.setAsideReason && (dialog.on ? s.state === 'off' : s.state === 'on')).map(skillTitle)}
          busy={busy} onCancel={() => setDialog(null)} onConfirm={() => void switchMany(dialog.on, dialog.group)}
        />
      )}
      {dialog?.kind === 'remove' && (
        <ConfirmRemove
          name={skillTitle(dialog.skill)} busy={busy} onCancel={() => setDialog(null)}
          onConfirm={async () => { await run(() => removePlaceSkill({ placeSkillId: dialog.skill.id })); setDialog(null) }}
        />
      )}
    </div>
  )
}
