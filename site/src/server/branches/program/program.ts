/**
 * The commit helper's program (live preview spec, *Git on what an agent wrote*): every Git command the site runs on a
 * code workspace's repository or a branch's copy. The helper container (`../helperContainer.ts`) runs it with Node,
 * and it sees only what that container mounts: the workspace at `roots.ws`, the copy at `roots.copy`, its own `/tmp`.
 * So a link an agent planted in a copy can only lead somewhere inside those.
 *
 * It reads one JSON request from standard input and writes one JSON answer to standard output: the operation's
 * result, or `{ refused, detail }`. Kept as plain JavaScript in strings, since the container has Node and none of the
 * site's code; the tests run it with Node directly against real repositories.
 */
import { PROGRAM_BUNDLE_OPS } from './bundleOps'
import { PROGRAM_CORE } from './core'
import { PROGRAM_COPY_OPS } from './copyOps'
import { PROGRAM_MAIN_OPS } from './mainOps'
import { PROGRAM_READ_OPS } from './readOps'
import { PROGRAM_UPDATE_OPS } from './updateOps'

const DISPATCH = String.raw`
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => { input += d })
process.stdin.on('end', () => {
  let answer
  try {
    const q = JSON.parse(input)
    const op = Object.prototype.hasOwnProperty.call(ops, q.op) ? ops[q.op] : null
    if (!op) throw new Refusal('unknownOp')
    answer = op(q, q.roots || {})
  } catch (e) {
    answer = e instanceof Refusal ? { refused: e.code, detail: e.detail } : { refused: 'failed', detail: String(e && e.message || e).slice(0, 500) }
  }
  process.stdout.write(JSON.stringify(answer) + '\n')
})
`

export const GIT_PROGRAM = [PROGRAM_CORE, 'const ops = {}', PROGRAM_COPY_OPS, PROGRAM_MAIN_OPS, PROGRAM_READ_OPS, PROGRAM_UPDATE_OPS, PROGRAM_BUNDLE_OPS, DISPATCH].join('\n')
