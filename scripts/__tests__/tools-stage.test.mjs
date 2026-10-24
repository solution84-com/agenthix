// node --test scripts/__tests__/tools-stage.test.mjs
// The agent and the executor image build from one tools stage, so what the agent can run a step can run.
// A Dockerfile cannot include another, so the stage is written in both and held to be identical here.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')

/** The lines between the stage's markers, markers included. */
export function toolsStage(dockerfile) {
  const m = /^# >>> tools stage[^\n]*\n[\s\S]*?^# <<< tools stage$/m.exec(dockerfile)
  return m ? m[0] : null
}

test('the agent and executor images carry the same tools stage @SC-1356', () => {
  const agent = toolsStage(read('site/docker/agent.Dockerfile'))
  const executor = toolsStage(read('site/docker/executor.Dockerfile'))
  assert.ok(agent, 'agent.Dockerfile has no tools stage between its markers')
  assert.ok(executor, 'executor.Dockerfile has no tools stage between its markers')
  assert.equal(executor, agent, 'the tools stage differs between agent.Dockerfile and executor.Dockerfile: change both')
})

test('both images build their last stage on the tools stage @SC-1356', () => {
  for (const file of ['site/docker/agent.Dockerfile', 'site/docker/executor.Dockerfile']) {
    const froms = read(file).split('\n').filter(l => /^FROM /.test(l))
    assert.equal(froms.at(-1), 'FROM tools', `${file}: the last stage must be FROM tools`)
  }
})

test('the executor image has no credential helper, harness or launcher @SC-1356', () => {
  const executor = read('site/docker/executor.Dockerfile')
  for (const word of ['agenthix-git-credential', 'agenthix-contain', 'claude-code', 'opencode']) {
    assert.ok(!executor.includes(word), `executor.Dockerfile mentions ${word}`)
  }
  assert.doesNotMatch(executor, /git config --(system|global)/)
})
