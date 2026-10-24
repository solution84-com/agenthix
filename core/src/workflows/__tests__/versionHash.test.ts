import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition } from '../parse.js'
import { checkVersionContent, encodeWorkflowVersion, hashWorkflowVersion, type WorkflowVersionContent } from '../versionHash.js'
import type { WorkflowDefinition } from '../definition.js'
import { DEPLOY_STAGING } from './fixtures.js'

/** ASCII only, which is all these tests use. */
const text = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const DIGEST = `sha256:${'ab'.repeat(32)}`

const definitionOf = (raw: unknown): WorkflowDefinition => {
  const r = parseWorkflowDefinition(raw)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.definition
}

const deployStaging = (): WorkflowVersionContent => ({
  definition: definitionOf(DEPLOY_STAGING),
  files: [
    { path: 'deploy/upload.sh', bytes: text('#!/bin/sh\nscp -i /run/secrets/STAGING_DEPLOY_KEY dist.tgz "$STAGING_HOST:"\n'), executable: true },
    { path: 'deploy/restart.sh', bytes: text('#!/bin/sh\nssh -i /run/secrets/STAGING_DEPLOY_KEY "$STAGING_HOST" restart\n'), executable: true },
  ],
  githubSecretNames: [],
  executorImageDigest: DIGEST,
})

const minimal = (): WorkflowVersionContent => ({
  definition: definitionOf({ name: 'x', steps: [{ name: 'S', run: 'true' }] }),
  files: [],
  githubSecretNames: [],
  executorImageDigest: DIGEST,
})

const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('')
const u64 = (n: number) => n.toString(16).padStart(16, '0')
const s = (v: string) => `73${u64(v.length)}${hex(text(v))}`

describe('the version hash @SC-1363', () => {
  // Both vectors were also computed by a separate encoder written from the description in versionHash.ts.
  it('is pinned by its test vectors: a change to the encoding is a new format, never an edit', async () => {
    expect(await hashWorkflowVersion(minimal())).toBe('0d82792ae7290de8061265853b2affb1c346463c4fa74218f5679c3facb72037')
    expect(await hashWorkflowVersion(deployStaging())).toBe('6c472137e3c854552f0e4b41c94c88c8892dc09bb88d35876b1fbb85c7a62282')
  })

  it('encodes a record of twelve fields, keys in order, each value tagged and length-prefixed', () => {
    const e = hex(encodeWorkflowVersion(minimal()))
    const expected = [
      `72${u64(12)}`,
      s('description'), s(''),
      s('executorImageDigest'), s(DIGEST),
      s('files'), `6c${u64(0)}`,
      s('format'), s('workflow-version/1'),
      s('github'), `72${u64(0)}`,
      s('githubSecretNames'), `6c${u64(0)}`,
      s('hosts'), `6c${u64(0)}`,
      s('name'), s('x'),
      s('parameters'), `6c${u64(0)}`,
      s('steps'), `6c${u64(1)}`,
      `72${u64(4)}`, s('name'), s('S'), s('run'), s('true'), s('secrets'), `6c${u64(0)}`, s('timeoutSeconds'), '6e',
      s('timeoutSeconds'), `69${u64(600)}`,
      s('variables'), `6c${u64(0)}`,
    ].join('')
    expect(e).toBe(expected)
  })

  it('changes with everything a run instruction carries', async () => {
    const base = await hashWorkflowVersion(deployStaging())
    const changes: ((c: WorkflowVersionContent) => void)[] = [
      c => { c.files[0].bytes = text('#!/bin/sh\necho changed\n') },
      c => { c.files[0].executable = false },
      c => { c.definition.steps[0].run = 'npm install' },
      c => { c.definition.steps[0].name = 'Build it' },
      c => { c.definition.steps[0].secrets = ['STAGING_DEPLOY_KEY'] },
      c => { c.definition.steps[1].timeoutSeconds = 60 },
      c => { c.definition.steps.reverse() },
      c => { c.definition.variables = ['STAGING_HOST'] },
      c => { c.definition.parameters = [{ name: 'ref', kind: 'pattern', pattern: '^.+$' }] },
      c => { c.definition.parameters = [{ name: 'ref', kind: 'text' }] },
      c => { c.definition.hosts = [{ host: 'staging.example.com', port: 2222 }] },
      c => { c.definition.github = { contents: 'read' } },
      c => { c.definition.timeoutSeconds = 601 },
      c => { c.definition.description = 'Deploy' },
      c => { c.definition.name = 'deploy-prod' },
      c => { c.githubSecretNames = ['NPM_TOKEN'] },
      c => { c.executorImageDigest = `sha256:${'cd'.repeat(32)}` },
    ]
    const seen = new Set([base])
    for (const [i, change] of changes.entries()) {
      const c = deployStaging()
      change(c)
      const h = await hashWorkflowVersion(c)
      expect(seen.has(h), `change ${i}`).toBe(false)
      seen.add(h)
    }
  })

  it('does not change with the order of a set', async () => {
    const a = deployStaging()
    const b = deployStaging()
    b.files.reverse()
    b.definition.variables.reverse()
    b.definition.hosts.reverse()
    expect(await hashWorkflowVersion(b)).toBe(await hashWorkflowVersion(a))
  })

  it('keeps fields apart, so moving bytes from one to the next is a different hash', async () => {
    const one = minimal()
    one.definition.steps = [{ name: 'ab', run: 'c', secrets: [], timeoutSeconds: null }]
    const two = minimal()
    two.definition.steps = [{ name: 'a', run: 'bc', secrets: [], timeoutSeconds: null }]
    expect(await hashWorkflowVersion(one)).not.toBe(await hashWorkflowVersion(two))
  })

  it('refuses content whose files are not the definition\'s, or not normalised, or a bad digest', () => {
    const missing = deployStaging(); missing.files.pop()
    const extra = deployStaging(); extra.files.push({ path: 'x.sh', bytes: text(''), executable: false })
    const unnormalised = deployStaging(); unnormalised.files[0].path = './deploy/upload.sh'
    const climbing = deployStaging(); climbing.files[0].path = '../upload.sh'
    const digest = deployStaging(); digest.executorImageDigest = 'latest'
    const token = deployStaging(); token.githubSecretNames = ['GITHUB_TOKEN']
    for (const c of [missing, extra, unnormalised, climbing, digest, token]) {
      expect(checkVersionContent(c).length).toBeGreaterThan(0)
      expect(() => encodeWorkflowVersion(c)).toThrow()
    }
    expect(checkVersionContent(deployStaging())).toEqual([])
  })

  it('refuses text that is not valid Unicode rather than replacing it', () => {
    const c = minimal()
    c.definition.description = 'a\ud800'
    expect(() => encodeWorkflowVersion(c)).toThrow()
  })
})
