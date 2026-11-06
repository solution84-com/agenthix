import { useState } from 'react'
import { Link } from 'react-router'
import { useAction, restoreKnowledgeVersion } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { BRANDING, type KnowledgeStepView } from '@agenthix/core'
import { CHANGE_WORDS, seeChangeHref, titleOfStep, type ChangeStep } from './knowledgeSteps'

const LINK = 'font-medium text-accent hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center'

function ChangeStep({ data, placePath }: { data: ChangeStep; placePath?: string }) {
  const restore = useAction(restoreKnowledgeVersion)
  const [state, setState] = useState<'idle' | 'busy' | 'undone'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const see = seeChangeHref(data, placePath)
  const owner = data.owner
  const canUndo = Boolean(data.previousVersionId)

  const undo = async () => {
    if (!data.previousVersionId) return
    setState('busy')
    setProblem(null)
    try {
      const result = await restore({ owner, page: data.page, versionId: data.previousVersionId })
      if (result.outcome === 'refused') { setProblem(result.message); setState('idle') }
      else setState('undone')
    } catch (err) {
      setProblem(refusalText(err))
      setState('idle')
    }
  }

  return (
    <span data-testid="knowledge-change-step" className="min-w-0 break-words">
      <span className="font-medium text-text-primary">{CHANGE_WORDS[data.change]} · {titleOfStep(data)}</span>
      {data.summary && <span className="block text-micro text-text-secondary" data-testid="knowledge-change-summary">{data.summary}</span>}
      <span className="block text-micro">
        {see && <Link to={see} className={LINK}>See change</Link>}
        {see && canUndo && <span aria-hidden> · </span>}
        {canUndo && (state === 'undone'
          ? <span className="text-text-muted" data-testid="knowledge-undone">Undone</span>
          : <button type="button" disabled={state === 'busy'} onClick={undo} className={`${LINK} disabled:opacity-50`}>Undo</button>)}
      </span>
      {problem && <span role="alert" className="block text-micro text-danger">{problem}</span>}
    </span>
  )
}

/** One knowledge call of a reply's step, drawn in place of the step's plain label. */
export function KnowledgeStepRow({ data, placePath }: { data: KnowledgeStepView; placePath?: string }) {
  if (data.kind === 'knowledge_change') return <ChangeStep data={data} placePath={placePath} />
  if (data.kind === 'knowledge_search') {
    return (
      <span data-testid="knowledge-search-step" className="min-w-0 break-words">
        <span className="font-medium text-text-primary">Searched Knowledge</span>
        {data.names.length > 0 && <span className="text-text-muted"> · {data.names.join(' · ')}</span>}
      </span>
    )
  }
  // The label is stored without the product's name; the board's words are made here.
  return (
    <span data-testid="platform-page-step" className="min-w-0 break-words">
      <span className="font-medium text-text-primary">Looked up {BRANDING.displayName} · {data.title || data.page}</span>
    </span>
  )
}
