/**
 * The workspace view's one next-step button, top right (and at the foot on a phone): what it says for where the
 * person is. Without Git it offers Git; on a branch it merges, or brings the branch up to date when it is behind main
 * or its merge clashed, and says *Updating…* while that runs; on an older version of main it goes back to the latest
 * or returns main to it. A Viewer gets no button but *Back to latest*.
 */
export type NextStep =
  | { kind: 'none' }
  | { kind: 'git' }
  | { kind: 'merge' }
  | { kind: 'update'; clashed: boolean }
  | { kind: 'updating' }
  | { kind: 'older'; mayReturn: boolean }

export function nextStepOf(at: {
  git: boolean
  canAct: boolean
  /** The branch in view; null for main. */
  line: { behind: number } | null
  /** An older version of main in view; null for the latest. */
  version: string | null
  /** *Bring up to date* was pressed for this branch and has not finished. */
  updating: boolean
  /** A merge of this branch clashed since it was last brought up to date. */
  clashed: boolean
}): NextStep {
  if (!at.git) return at.canAct ? { kind: 'git' } : { kind: 'none' }
  if (!at.line) return at.version ? { kind: 'older', mayReturn: at.canAct } : { kind: 'none' }
  if (!at.canAct) return { kind: 'none' }
  if (at.updating) return { kind: 'updating' }
  if (at.clashed || at.line.behind > 0) return { kind: 'update', clashed: at.clashed }
  return { kind: 'merge' }
}

/** Where *Bring up to date* stands for one branch: asked, and whether its agent has been seen working since. */
export type UpdateAsk = { branchId: string; sawWorking: boolean }

/**
 * The ask after the branch's line changed: kept while its agent has not started or still works, gone once the agent
 * that started has stopped. An ask for another branch is kept as it is.
 */
export function followUpdate(ask: UpdateAsk | null, line: { id: string; working: unknown } | null): UpdateAsk | null {
  if (!ask || !line || line.id !== ask.branchId) return ask
  if (line.working) return ask.sawWorking ? ask : { ...ask, sawWorking: true }
  return ask.sawWorking ? null : ask
}
