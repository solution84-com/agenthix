import { useRef, useState } from 'react'
import { isFinal, useBackgroundRead } from '@agenthix/ui/attention'
import {
  useAction, useQuery, acceptSkillProposal, aimSkillProposal, getSkillDraftCard, getSkillProposal, publishAssetDraft,
  publishPlaceSkillDraft, rejectSkillProposal,
} from 'wasp/client/operations'
import type { SkillCardRef } from '../../assets/proposals/types'
import { libraryAssetPath } from '../../library/components/libraryRoutes'
import { actionErrorText } from '../hooks/threadState'
import { sentAsProposed } from './sentAsProposed'
import { SkillDraftCard, SkillProposalCard } from './SkillProposalCard'

/** The card `propose_skill` left in the thread, read live: a proposal and its review, or a draft change and Publish. */
export function SkillCardRow({ card }: { card: SkillCardRef }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4">
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {card.kind === 'proposal' ? <ProposalRow proposalId={card.proposalId} /> : <DraftRow card={card} />}
      </div>
    </div>
  )
}

/** One who may not see it (a person who isn't its reviewer or its person) sees the line, without its content. */
function Unavailable({ text }: { text: string }) {
  return <p className="px-3 py-2 text-micro text-text-muted">{text}</p>
}

function ProposalRow({ proposalId }: { proposalId: string }) {
  const query = useQuery(getSkillProposal, { proposalId })
  const { data, error: readError, refetch } = query
  const read = useBackgroundRead(query, { what: 'The skill proposal' })
  const accept = useAction(acceptSkillProposal)
  const reject = useAction(rejectSkillProposal)
  const aim = useAction(aimSkillProposal)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const last = useRef<(() => void) | null>(null)
  // One who may not see it gets the plain line (a final answer); a read that did not come back says so, with Try again.
  if (!data && readError) return isFinal(readError) ? <Unavailable text="A skill was proposed here." /> : <>{read.nudge}</>
  if (!data) return null
  const run = async (work: () => Promise<unknown>, fallback: string) => {
    last.current = () => void run(work, fallback)
    setState({ busy: true, error: null })
    try {
      await work()
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: actionErrorText(err, fallback) })
    }
    void refetch()
  }
  // Only SKILL.md was edited here; every other file goes back as the bytes it was proposed with, text or not.
  const files = (skillMd: string) => data.files.map((f) => (f.path === 'SKILL.md' ? { path: f.path, text: skillMd } : sentAsProposed(f)))
  return (
    <>
    <SkillProposalCard
      proposal={data}
      actions={{
        ...state,
        retry: () => last.current?.(),
        onAccept: (edited, note) => void run(() => accept({ proposalId, digest: data.digest, note, ...(edited !== null ? { files: files(edited) } : {}) }), 'Could not accept it'),
        onReject: (note) => void run(() => reject({ proposalId, digest: data.digest, note }), 'Could not answer it'),
        onAim: (to) => void run(() => aim({ proposalId, aim: to }), 'Could not aim it there'),
      }}
    />
    {read.nudge}
    </>
  )
}

function DraftRow({ card }: { card: Extract<SkillCardRef, { kind: 'draft' }> }) {
  const query = useQuery(getSkillDraftCard, { kind: card.draft.kind, id: card.draft.id })
  const { data, error: readError, refetch } = query
  const read = useBackgroundRead(query, { what: `The draft of ${card.name}` })
  const publishAsset = useAction(publishAssetDraft)
  const publishPlace = useAction(publishPlaceSkillDraft)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [publishedHere, setPublishedHere] = useState(false)
  if (!data && readError) return isFinal(readError) ? <Unavailable text={`A draft of ${card.name} was changed here.`} /> : <>{read.nudge}</>
  if (!data) return null
  const onPublish = async (note: string) => {
    setState({ busy: true, error: null })
    try {
      if (card.draft.kind === 'asset') await publishAsset({ assetId: card.draft.id, revision: card.revision, note })
      else await publishPlace({ placeSkillId: card.draft.id, revision: card.revision, note })
      setPublishedHere(true)
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: actionErrorText(err, 'Could not publish it') })
    }
    void refetch()
  }
  return (
    <>
    <SkillDraftCard name={card.name} shownRevision={card.revision} draft={data} busy={state.busy} error={state.error} onPublish={(n) => void onPublish(n)}
      publishedHere={publishedHere} addHref={card.draft.kind === 'asset' ? libraryAssetPath(card.draft.id) : undefined} />
    {read.nudge}
    </>
  )
}
