import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { NativeSelect } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import { NewWorkspaceForm } from '../../storage/pages/NewWorkspaceForm'
import { newRoutineHref, routinesHref } from '../routines/routineAddresses'
import { boardAddress, workspaceAddress } from '../placeAddresses'
import { CHAT_PLACE, useAcrossListUrl, type Creating } from './acrossListUrl'

const HINT: Record<Creating, string> = {
  board: 'Only projects where you may add boards',
  workspace: 'A project where you may add workspaces, or your own Chat',
  routine: 'A project you work in, or your own Chat',
}

/** A place a board, workspace or routine can be added to: only where the person may add one. */
export interface NewPlace {
  /** The project's id, or the person's id for their own Chat. */
  id: string
  /** The project's key, or `chat`. */
  value: string
  name: string
  key: string | null
  siteLabel: string | null
}

function PlacePicker({ what, places, suggested, onChoose, onCancel }: {
  what: Creating
  places: NewPlace[]
  /** The place the list behind it was filtered to, offered first. */
  suggested: string | null
  onChoose: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(places.find(p => p.value === suggested)?.value ?? places[0]?.value ?? '')
  return (
    <form className="max-w-md space-y-4" onSubmit={e => { e.preventDefault(); if (value) onChoose(value) }}>
      <h2 className="text-h2 font-semibold text-text-primary">New {what}</h2>
      {places.length === 0 ? (
        <p className="text-body text-text-muted">There is no place where you may add a {what}.</p>
      ) : (
        <label className="block">
          <span className="mb-1 block text-micro font-medium uppercase tracking-wide text-text-muted">{what === 'workspace' ? 'Place' : 'Project'}</span>
          <NativeSelect value={value} onChange={e => setValue(e.target.value)}>
            {places.map(p => <option key={p.value} value={p.value}>{p.name}</option>)}
          </NativeSelect>
          <span className="mt-1 block text-micro text-text-muted">{HINT[what]}</span>
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" className={FILES_BUTTON} onClick={onCancel}>Cancel</button>
        {places.length > 0 && <button type="submit" className={FILES_BUTTON_PRIMARY}>Continue</button>}
      </div>
    </form>
  )
}

/**
 * New board…, New workspace… and New routine… from the split button (every screen reviewed spec §3): the place
 * first, then the tool's own form, and what was made opens in its tool; a new board opens as its project's unsaved
 * board view. The place chosen is kept in the address.
 */
export function NewIntoPlace({ what, places }: { what: Creating; places: NewPlace[] }) {
  const { screen, chooseInto, stopCreating } = useAcrossListUrl()
  const navigate = useNavigate()
  const place = places.find(p => p.value === screen.into)
  if (!place) return <PlacePicker what={what} places={places} suggested={what === 'board' ? screen.project : screen.place} onChoose={chooseInto} onCancel={stopCreating} />

  const back = () => chooseInto(null)
  // A routine is made on its project's New routine page; the person's own space has no project address, so its list.
  if (what === 'routine') return <Navigate to={place.key ? newRoutineHref(place.key) : routinesHref({ key: null })} replace />
  // A new board is its project's unsaved board view, saved from there.
  if (what === 'board') return <Navigate to={boardAddress(place, 'new')} replace />
  return (
    <div className="max-w-xl">
      <NewWorkspaceForm
        owner={{ ownerType: place.value === CHAT_PLACE ? 'user' : 'project', ownerId: place.id }}
        siteLabel={place.siteLabel}
        onBack={back}
        onCreated={id => navigate(workspaceAddress(place, id))}
      />
    </div>
  )
}
