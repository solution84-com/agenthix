/** What the actions on ticked tasks say (T4). Pure, so each is tested as words. */

/** Why Add to sprint… is greyed: a project's sprints are planned on the Sprints screen, which is not built yet. */
export const NO_SPRINT_YET = 'This project has no sprint to add tasks to yet.'

/**
 * What the attention dialog says when an action on ticked tasks did not reach all of them: which ones, and why
 * when hq said. Null when every task changed, since the list then shows the result.
 */
export function bulkOutcome(what: string, failedKeys: string[], total: number, reason: string | null): string | null {
  if (failedKeys.length === 0) return null
  const named = failedKeys.length <= 3 ? failedKeys.join(', ') : `${failedKeys.slice(0, 3).join(', ')} and ${failedKeys.length - 3} more`
  const lead = failedKeys.length === total
    ? `${total === 1 ? `${named} was not` : `None of the ${total} tasks were`} ${what}`
    : `${total - failedKeys.length} of ${total} tasks were ${what}; ${named} ${failedKeys.length === 1 ? 'was' : 'were'} not`
  const why = reason ? ` ${reason.replace(/\s*Nothing was changed\.?$/, '').trim()}` : ''
  const tail = failedKeys.length === total ? ' Nothing was changed.' : ' They are still ticked.'
  return `${lead}.${why ? `${why.endsWith('.') ? why : `${why}.`}` : ''}${tail}`
}
