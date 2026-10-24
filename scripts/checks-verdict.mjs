// The verdict of "All checks passed" (checks.yml): it passes only when "changes" succeeded, every job it selected
// succeeded and every other job was skipped, so a selected job that was skipped or cancelled fails it, and so does one
// that ran unselected.
//   NEEDS='<toJSON(needs)>' SELECTED='<the jobs "changes" selected, as JSON>' node scripts/checks-verdict.mjs
import { pathToFileURL } from 'node:url'

/** The problems with these results, none when they pass. `needs` maps each job to `{ result }`. */
export function verdict(needs, selected) {
  const results = Object.fromEntries(Object.entries(needs).map(([job, v]) => [job, v?.result]))
  if (results.changes !== 'success') return [`'changes' did not succeed (${results.changes ?? 'no result'})`]
  const problems = []
  for (const job of selected) if (!(job in results)) problems.push(`${job} was selected but is not one of the jobs checked here`)
  for (const [job, result] of Object.entries(results)) {
    if (job === 'changes') continue
    if (selected.includes(job)) {
      if (result !== 'success') problems.push(`${job} was selected and its result is ${result}`)
    } else if (result !== 'skipped') problems.push(`${job} was not selected and its result is ${result}`)
  }
  return problems
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const needs = JSON.parse(process.env.NEEDS ?? '{}')
  const selected = JSON.parse(process.env.SELECTED || '[]')
  for (const [job, v] of Object.entries(needs)) console.log(`${job} ${v?.result}`)
  console.log(`Selected: ${JSON.stringify(selected)}`)
  const problems = verdict(needs, selected)
  for (const p of problems) console.log(p)
  process.exit(problems.length ? 1 : 0)
}
