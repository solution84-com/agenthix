// node scripts/security/run.mjs [--no-integration] [--no-container] [--no-cross-app]   (npm run test:security at the root)
//
// The security matrix, in one pass: every row of the workflows design's "Each attack, and what stops it" (A1–A18) and
// of the agent knowledge design's guards and place rule (K-…), with the tests that show its control holds, run with the
// suites they belong to, then one line per row. A row passes only when each of its tests ran and passed; a test
// skipped (Docker, an image or ripgrep missing, say) fails its row, so a run without them can't read as a pass.
// `--no-integration`, `--no-container` and `--no-cross-app` leave those suites out, and their rows are then shown as
// not run.
//
// The integration suites need the test databases, the container suites Docker with the executor and agent images
// (EXECUTOR_TEST_IMAGE, AGENT_TEST_IMAGE; `imgtest/executor:dev` and `imgtest/agent:dev` by default), and the
// cross-app suite both test databases and its own packages (`npm ci` in tests/cross-app, as `npm run test:cross-app`
// does). The knowledge rows need ripgrep (`rg`) on PATH.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXECUTOR_IMAGE = process.env.EXECUTOR_TEST_IMAGE ?? 'imgtest/executor:dev'
const AGENT_IMAGE = process.env.AGENT_TEST_IMAGE ?? 'imgtest/agent:dev'

// Each suite: where it runs, how, and whether a flag leaves it out.
const SUITES = {
  'core unit': { cwd: 'core', cmd: ['npx', 'vitest', 'run'] },
  'hq unit': { cwd: 'hq', cmd: ['npx', 'vitest', 'run'] },
  'hq integration': { cwd: 'hq', cmd: ['npm', 'run', 'test:integration', '--'], kind: 'integration' },
  'hq container': {
    cwd: 'hq', cmd: ['npx', 'vitest', 'run'], kind: 'container',
    env: { STARTER_CONTAINER_TESTS: '1', EXECUTOR_IMAGE },
  },
  'site unit': { cwd: 'site', cmd: ['npx', 'vitest', 'run'] },
  'site container': {
    cwd: 'site', cmd: ['npx', 'vitest', 'run', '-c', 'vitest.container.config.ts'], kind: 'container',
    env: { EXECUTOR_TEST_IMAGE: EXECUTOR_IMAGE, AGENT_TEST_IMAGE: AGENT_IMAGE },
  },
  'cross-app': { cwd: 'tests/cross-app', cmd: ['npx', 'vitest', 'run'], kind: 'cross-app' },
}

const HQ_CHECKS = 'hq/src/workflows/checks/__tests__'
const HQ_REVIEW = 'hq/src/workflows/review/__tests__'
const HQ_WF = 'hq/src/workflows/__tests__'
const HQ_GH = 'hq/src/github/__tests__'
const SITE_EX = 'site/src/executor/__tests__'
const SECURITY = `${SITE_EX}/security`
const CORE_FT = 'core/src/fileTools/__tests__'
const HQ_K = 'hq/src/knowledge/__tests__'
const HQ_KP = 'hq/src/knowledge/people/__tests__'
const HQ_CP = 'hq/src/server/controlplane/__tests__'
const HQ_CONV = 'hq/src/conversations/__tests__'
const HQ_LEAD = 'hq/src/conversations/lead/__tests__'
const HQ_LEAD_TOOLS = 'hq/src/conversations/memory/__tests__/leadKnowledgeTools.test.ts'
const SITE_K = 'site/src/server/knowledge/__tests__'
const SITE_SEARCH = 'site/src/server/storage/__tests__/knowledgeSearch.test.ts'
const SITE_MCP = 'site/src/server/mcp/__tests__/knowledgeTools.test.ts'
const CROSS_LEVELS = 'tests/cross-app/07-knowledge-levels.test.ts'

// Row → its tests, each with the suite it runs in.
const MATRIX = [
  ['A1', 'The workflow prints or encodes a value', [
    ['site container', 'site/src/executor/masking/__tests__/masking.container.test.ts'],
    ['site unit', `${SITE_EX}/runSteps.test.ts`],
    ['hq unit', `${HQ_CHECKS}/secretRules.test.ts`],
  ]],
  ['A2', 'A package steals a secret while installing', [
    ['hq unit', `${HQ_CHECKS}/otherRules.test.ts`],
    ['hq unit', `${HQ_CHECKS}/secretRules.test.ts`],
    ['site unit', `${SITE_EX}/runSteps.test.ts`],
    ['site container', `${SECURITY}/steps.container.test.ts`],
  ]],
  ['A3', 'A process from one step waits for a later step\'s secret', [
    ['site container', `${SECURITY}/steps.container.test.ts`],
  ]],
  ['A4', 'An encoding that masking misses', [
    ['hq unit', `${HQ_CHECKS}/card.test.ts`],
    ['hq unit', `${HQ_REVIEW}/secretStepCard.test.ts`],
  ]],
  ['A5', 'The value is left in a file for the agent', [
    ['site container', 'site/src/executor/masking/__tests__/masking.container.test.ts'],
    ['site unit', `${SITE_EX}/run.test.ts`],
  ]],
  ['A6', 'The agent\'s container inspects an executor container', [
    ['site container', `${SITE_EX}/executor.container.test.ts`],
    ['site container', `${SECURITY}/agent.container.test.ts`],
  ]],
  ['A7', 'The value is sent out, directly or by DNS', [
    ['site container', 'site/src/executor/egress/__tests__/egress.container.test.ts'],
    ['site unit', `${SITE_EX}/run.test.ts`],
  ]],
  ['A8', 'The files change between approval and run', [
    ['site unit', `${SITE_EX}/instruction.test.ts`],
    ['site container', `${SITE_EX}/executor.container.test.ts`],
    ['hq integration', `${HQ_WF}/runs.integration.test.ts`],
    ['site container', `${SECURITY}/steps.container.test.ts`],
  ]],
  ['A9', 'A run while the workflow is off', [
    ['hq unit', `${HQ_WF}/runsChecks.test.ts`],
    ['hq integration', `${HQ_WF}/library.integration.test.ts`],
  ]],
  ['A10', 'A parameter becomes code or an option', [
    ['hq unit', `${HQ_WF}/runsChecks.test.ts`],
    ['hq unit', `${HQ_CHECKS}/otherRules.test.ts`],
  ]],
  ['A11', 'The workflow steers the reviewer', [
    ['hq unit', `${HQ_REVIEW}/reviewer.test.ts`],
    ['hq unit', `${HQ_REVIEW}/card.test.ts`],
  ]],
  ['A12', 'The agent\'s command gets a GitHub token from git', [
    ['site unit', 'site/src/agents/runtime/__tests__/agentImage.test.ts'],
    ['site unit', 'site/src/server/__tests__/runTokenSurface.test.ts'],
    ['site unit', 'site/src/server/__tests__/noCredentialEndpoint.test.ts'],
    ['site container', `${SECURITY}/agent.container.test.ts`],
  ]],
  ['A13', 'The agent changes what an approved step runs', [
    ['site unit', `${SITE_EX}/snapshotWriteBack.test.ts`],
    ['hq container', 'hq/src/workflows/starters/__tests__/starterGit.container.test.ts'],
    ['hq unit', `${HQ_CHECKS}/secretRules.test.ts`],
  ]],
  ['A14', 'A steered reviewer gets a harmful version approved in one tap', [
    ['hq unit', `${HQ_CHECKS}/card.test.ts`],
    ['hq unit', `${HQ_REVIEW}/card.test.ts`],
    ['hq unit', `${HQ_REVIEW}/secretStepCard.test.ts`],
  ]],
  ['A15', 'A member links someone else\'s repository into their own storage', [
    ['hq unit', `${HQ_GH}/accountRules.test.ts`],
    ['hq unit', `${HQ_GH}/connectRule.test.ts`],
    ['hq unit', `${HQ_WF}/rules.test.ts`],
    ['hq integration', `${HQ_WF}/library.integration.test.ts`],
  ]],
  ['A16', 'A secret set on GitHub is read by code the agent pushes', [
    ['hq unit', `${HQ_GH}/protectedBranches.test.ts`],
    ['hq unit', `${HQ_GH}/githubEnvironment.test.ts`],
    ['hq unit', `${HQ_CHECKS}/ceiling.test.ts`],
    ['hq unit', 'hq/src/workflows/starters/__tests__/runGuards.test.ts'],
  ]],
  ['A17', 'A token for the wrong repository, project or client', [
    ['hq unit', `${HQ_GH}/mintGate.test.ts`],
    ['hq unit', `${HQ_GH}/mintGateConnect.test.ts`],
    ['hq unit', `${HQ_WF}/integrationValues.test.ts`],
  ]],
  ['A18', 'A link in the workspace points the site at a file outside it', [
    ['site unit', `${SITE_EX}/snapshotWriteBack.test.ts`],
    ['hq unit', `${HQ_WF}/proposalContent.test.ts`],
  ]],

  // The agent knowledge design: K-S1–K-S8 are its guards S1–S8 (part 3, *Running a pattern safely*), K-F the file
  // tools doing what the native tools do (V3), and K-R1–K-R6 its place rule (V5, each line its own row; V7's no mount).
  ['K-S1', 'A search pattern that never finishes', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['core unit', `${CORE_FT}/grepGuards.test.ts`],
    ['site unit', SITE_SEARCH],
    ['hq unit', `${HQ_K}/platformGuide.test.ts`],
  ]],
  ['K-S2', 'Heavy or many searches', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['core unit', `${CORE_FT}/grepArgs.test.ts`],
    ['core unit', `${CORE_FT}/grepGuards.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeSearch.test.ts`],
    ['site unit', SITE_SEARCH],
  ]],
  ['K-S2b', 'A search pattern or option takes over the command', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['core unit', `${CORE_FT}/grepArgs.test.ts`],
    ['site unit', SITE_SEARCH],
  ]],
  ['K-S3', 'A page name or search path reads outside its folder', [
    ['core unit', `${CORE_FT}/paths.test.ts`],
    ['core unit', `${CORE_FT}/read.test.ts`],
    ['core unit', `${CORE_FT}/write.test.ts`],
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['site unit', `${SITE_K}/gate.test.ts`],
    ['site unit', `${SITE_K}/itemiser.test.ts`],
    ['site unit', SITE_SEARCH],
    ['hq unit', `${HQ_K}/knowledgePages.test.ts`],
    ['hq unit', `${HQ_K}/platformGuide.test.ts`],
    ['hq unit', `${HQ_KP}/peopleReads.test.ts`],
  ]],
  ['K-S4', 'Something private in the platform guide', [
    ['hq unit', `${HQ_K}/guideBuild.test.ts`],
    ['hq unit', `${HQ_K}/toolsReference.test.ts`],
  ]],
  ['K-S5', 'A huge search result or page', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['core unit', `${CORE_FT}/read.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeSearch.test.ts`],
  ]],
  ['K-S6', 'An error gives the system away', [
    ['core unit', `${CORE_FT}/paths.test.ts`],
    ['core unit', `${CORE_FT}/grepGuards.test.ts`],
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['site unit', `${SITE_K}/changeMethods.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeSearch.test.ts`],
    ['hq unit', `${HQ_K}/knowledgePages.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeLog.test.ts`],
    ['hq unit', HQ_LEAD_TOOLS],
  ]],
  ['K-S7', 'A person\'s words kept in logs', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeLog.test.ts`],
  ]],
  ['K-S8', 'A knowledge tool breaks a turn or a run', [
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['hq unit', `${HQ_K}/knowledgePages.test.ts`],
    ['hq unit', `${HQ_K}/knowledgeSearch.test.ts`],
    ['hq unit', `${HQ_K}/platformGuide.test.ts`],
    ['hq unit', HQ_LEAD_TOOLS],
    ['site unit', SITE_MCP],
  ]],
  ['K-F', 'A file tool answers otherwise than the native tool it copies', [
    ['core unit', `${CORE_FT}/grepArgs.test.ts`],
    ['core unit', `${CORE_FT}/grepOutput.test.ts`],
    ['core unit', `${CORE_FT}/grep.test.ts`],
    ['core unit', `${CORE_FT}/read.test.ts`],
    ['core unit', `${CORE_FT}/edit.test.ts`],
    ['core unit', `${CORE_FT}/write.test.ts`],
  ]],
  ['K-R1', 'A knowledge tool reaches a place the run or conversation does not hold', [
    ['hq unit', `${HQ_CP}/knowledgeOps.test.ts`],
    ['hq unit', HQ_LEAD_TOOLS],
    ['hq unit', `${HQ_K}/knowledgeSearch.test.ts`],
    ['hq unit', `${HQ_K}/knowledgePages.test.ts`],
    ['site unit', SITE_MCP],
    ['hq integration', `${HQ_CONV}/places.integration.test.ts`],
    ['cross-app', CROSS_LEVELS],
  ]],
  ['K-R2', 'start_work starts work in a place not in the conversation', [
    ['hq integration', 'hq/src/conversations/work/workers/__tests__/startWork.integration.test.ts'],
    ['hq integration', `${HQ_CONV}/places.integration.test.ts`],
  ]],
  ['K-R3', 'Someone other than the person adds a place, or the lead widens its own reach', [
    ['hq unit', `${HQ_CONV}/placesSuggest.test.ts`],
    ['hq integration', `${HQ_CONV}/places.integration.test.ts`],
    ['cross-app', CROSS_LEVELS],
  ]],
  ['K-R4', 'A place the person lost access to is still reached', [
    ['hq unit', `${HQ_LEAD}/placesBlock.test.ts`],
    ['hq integration', `${HQ_CONV}/places.integration.test.ts`],
    ['hq integration', `${HQ_LEAD}/placesBlock.integration.test.ts`],
  ]],
  ['K-R5', 'org: knowledge changed for someone not an organisation admin', [
    ['hq unit', `${HQ_K}/knowledgePages.test.ts`],
    ['hq unit', `${HQ_KP}/peopleChanges.test.ts`],
    ['hq integration', `${HQ_KP}/peopleOperations.integration.test.ts`],
  ]],
  ['K-R6', 'A run reads knowledge mounted into its container', [
    ['site unit', 'site/src/agents/runtime/__tests__/AgentEngine.resolveLocations.test.ts'],
    ['site container', `${SITE_K}/noKnowledgeMount.container.test.ts`],
  ]],
]

const args = new Set(process.argv.slice(2))
const left = new Set(['integration', 'container', 'cross-app'].filter(kind => args.has(`--no-${kind}`)))
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'security-matrix-'))

// Each suite runs once, with every file the matrix gives it; its JSON report says how each file's tests ended.
const results = new Map() // repo-relative file → { passed, failed, skipped }
const ranSuites = new Set()
let suiteFailed = false
for (const [name, suite] of Object.entries(SUITES)) {
  const files = [...new Set(MATRIX.flatMap(([, , tests]) => tests.filter(([s]) => s === name).map(([, f]) => f)))]
  if (!files.length || left.has(suite.kind)) continue
  const report = path.join(out, `${name.replace(/\W+/g, '-')}.json`)
  const rel = files.map(f => path.relative(suite.cwd, f))
  console.log(`\n== ${name}: ${files.length} files`)
  const r = spawnSync(suite.cmd[0], [...suite.cmd.slice(1), ...rel, '--reporter=default', '--reporter=json', `--outputFile=${report}`], {
    cwd: path.join(ROOT, suite.cwd), stdio: 'inherit', env: { ...process.env, ...suite.env },
  })
  ranSuites.add(name)
  if (r.status !== 0) suiteFailed = true
  if (!fs.existsSync(report)) continue
  for (const t of JSON.parse(fs.readFileSync(report, 'utf8')).testResults ?? []) {
    const file = path.relative(ROOT, t.name)
    const counts = results.get(file) ?? { passed: 0, failed: 0, skipped: 0 }
    for (const a of t.assertionResults ?? []) {
      if (a.status === 'passed') counts.passed++
      else if (a.status === 'failed') counts.failed++
      else counts.skipped++
    }
    if (t.status === 'failed' && !(t.assertionResults ?? []).length) counts.failed++
    results.set(file, counts)
  }
}

console.log('\n| Row | Attack | Tests | Result |\n|---|---|---|---|')
let rowsFailed = 0
for (const [row, attack, tests] of MATRIX) {
  const verdicts = tests.map(([suite, file]) => {
    if (!ranSuites.has(suite)) return 'not run'
    const c = results.get(file)
    if (!c || c.passed + c.failed === 0) return 'did not run'
    if (c.failed) return `${c.failed} failed`
    if (c.skipped) return `${c.skipped} skipped`
    return 'passes'
  })
  const result = verdicts.every(v => v === 'passes') ? 'passes' : verdicts.every(v => v === 'passes' || v === 'not run') ? 'partly not run' : 'FAILS'
  if (result === 'FAILS') rowsFailed++
  const list = tests.map(([, f], i) => `${f.split('/').filter(p => p !== '__tests__').slice(-2).join('/')} (${verdicts[i]})`).join(', ')
  console.log(`| ${row} | ${attack} | ${list} | ${result} |`)
}
fs.rmSync(out, { recursive: true, force: true })
process.exit(rowsFailed || suiteFailed ? 1 : 0)
