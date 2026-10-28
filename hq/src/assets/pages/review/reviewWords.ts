/** The review screen's words (board R1), from the proposal's own view. Client-safe and pure. */
import type { SkillProposalView } from '../../proposals/view'

const AIM_PLACE: Record<SkillProposalView['aim'], (p: SkillProposalView) => string> = {
  ORGANISATION: () => "the organisation's Library",
  PROJECT: p => p.placeName ?? 'the project',
  PERSON: () => 'Your space',
}

export function reviewWords(p: SkillProposalView, acceptsAs: string | null) {
  const where = AIM_PLACE[p.aim](p)
  const library = p.aim === 'ORGANISATION'
  const who = [p.proposedBy && `Proposed by ${p.proposedBy}`, p.proposedFor && `for ${p.proposedFor}`].filter(Boolean).join(' ')
  // `edits` names the version in use after the skill ("fernhill/code-review 3"); the sentence names the skill.
  const skill = p.edits?.split(' ')[0] ?? ''
  const reviewed = p.reviewedBy ? `${p.state === 'REJECTED' ? 'Rejected' : p.state === 'ACCEPTED_WITH_CHANGES' ? 'Accepted with changes' : 'Accepted'} by ${p.reviewedBy}` : null
  return {
    heading: p.edits ? `Edit to ${p.name} ${p.state === 'OPEN' ? 'waiting' : ''}`.trim() : `New skill ${p.name} ${p.state === 'OPEN' ? 'waiting' : ''}`.trim(),
    line: `${who || 'Proposed'} · for ${where}`,
    accepting: p.edits
      ? p.makesCopy
        ? `Accepting makes the organisation's own copy of ${skill}, which takes the original's place. Every agent that has it uses the copy from its next turn.`
        : `Accepting saves a new version of ${skill}${acceptsAs ? ` (${acceptsAs})` : ''}, with you as the one who accepted it and the proposal as its source. ${library ? 'Every agent that has it uses it from its next turn.' : 'Agents working there use it from their next turn.'}`
      : library
        ? `Accepting installs it as the organisation's own${acceptsAs ? `, version ${acceptsAs}` : ''}, with you as the one who accepted it. No agent has it until you give it to them, on its page.`
        : `Accepting publishes it into ${where} as version 1, switched on.`,
    acceptLabel: p.edits && acceptsAs && !p.makesCopy ? `Accept as version ${acceptsAs}` : 'Accept',
    checked: (count: number) => `${count} ${count === 1 ? 'file' : 'files'}, every one shown above, scripts included. Accepting publishes all of them.`,
    outcome: [reviewed, p.reviewNote && `“${p.reviewNote}”`].filter(Boolean).join(': ') || `Waiting for review by ${p.reviewers}.`,
    waiting: `Waiting for review by ${p.reviewers}. You can read it, but it isn't yours to decide.`,
  }
}
