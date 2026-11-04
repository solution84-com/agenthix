/**
 * What a real run adds to the prompt after the preview is built on a site: the preview has no run, so these are
 * described rather than shown, as the site does for the place's instructions and the board.
 */
export type PreviewSection = { key: string; label: string; content: string; editable: boolean }

const SKILLS: PreviewSection = {
  key: 'skills',
  label: 'Skills',
  content: "## Skills\n\n_The agent's skills, from its own folder and the Library, are made available to the run when it starts._",
  editable: false,
}

const NEW_COMMENTS: PreviewSection = {
  key: 'new_comments',
  label: 'New comments',
  content: '## New comments\n\n_Comments written on the task since the agent last ran on it are injected at execution time._',
  editable: false,
}

/** A task run's new comments come before its execution rules; skills come last in either mode. */
export function withRunPlaceholders(sections: PreviewSection[], mode: 'chat' | 'task'): PreviewSection[] {
  const withComments = [...sections]
  if (mode === 'task') {
    const at = withComments.findIndex(s => s.key === 'execution')
    withComments.splice(at === -1 ? withComments.length : at, 0, NEW_COMMENTS)
  }
  return [...withComments, SKILLS]
}
