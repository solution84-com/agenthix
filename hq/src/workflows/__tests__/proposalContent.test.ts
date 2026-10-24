import { describe, expect, it } from 'vitest'
import { hashWorkflowVersion, type WorkflowReadFilesResult, type WorkflowRunWorkspace, type WorkflowWireFile } from '@agenthix/core'
import { readProposal, type ProposalSources } from '../proposalContent'
import { readWorkflowYaml } from '../definitionYaml'

// A stand-in for the site's workflow.readFiles, over files given here, refusing links as the site does.
type Entry = { text: string; executable?: boolean } | 'link'
function standInSite(files: Record<string, Entry>) {
  const asked: string[][] = []
  return {
    asked,
    sites: {
      async readFiles(_siteId: string, _ws: WorkflowRunWorkspace, paths: string[]): Promise<WorkflowReadFilesResult> {
        asked.push(paths)
        const out: WorkflowWireFile[] = []
        for (const p of paths) {
          const f = files[p]
          if (f === undefined) return { ok: false, reason: 'missing', path: p, message: `${p} doesn't exist in the workspace. Nothing was changed.` }
          if (f === 'link') return { ok: false, reason: 'link', path: p, message: `${p} is a link, and links are never followed. Nothing was changed.` }
          out.push({ path: p, contentBase64: Buffer.from(f.text).toString('base64'), executable: f.executable ?? false })
        }
        return { ok: true, files: out }
      },
    },
  }
}

const DEFINITION = {
  name: 'deploy-staging',
  description: 'Build, upload and restart the app on staging',
  hosts: ['staging.example.com:22'],
  variables: ['STAGING_HOST'],
  steps: [
    { name: 'Build', run: 'npm ci && npm run build' },
    { name: 'Upload', secrets: ['STAGING_DEPLOY_KEY'], run: './deploy/upload.sh' },
  ],
  files: ['package-lock.json'],
}

const DIGEST = `sha256:${'1'.repeat(64)}`
const WS: WorkflowRunWorkspace = { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }

// JSON is YAML, and JSON.parse is the stand-in reader: the reader is chosen in definitionYaml.ts.
function sources(site: ReturnType<typeof standInSite>, over: Partial<ProposalSources> = {}): ProposalSources {
  return {
    sites: site.sites,
    readYaml: (text) => ({ ok: true, data: JSON.parse(text) }),
    secretNames: async () => ['STAGING_DEPLOY_KEY', 'OTHER'],
    variableNames: async () => ['STAGING_HOST'],
    executorImageDigest: DIGEST,
    ...over,
  }
}

const workspaceFiles = (definition: unknown = DEFINITION): Record<string, Entry> => ({
  '.workflows/deploy/workflow.yaml': { text: JSON.stringify(definition) },
  '.workflows/deploy/deploy/upload.sh': { text: '#!/bin/sh\nscp ...\n', executable: true },
  '.workflows/deploy/package-lock.json': { text: '{}' },
})

describe('reading a proposal', () => {
  it('reads the definition and the files it names relative to its folder, and hashes them with the image digest', async () => {
    const site = standInSite(workspaceFiles())
    const read = await readProposal('site-1', WS, './.workflows/deploy/workflow.yaml', sources(site))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(site.asked).toEqual([
      ['.workflows/deploy/workflow.yaml'],
      ['.workflows/deploy/deploy/upload.sh', '.workflows/deploy/package-lock.json'],
    ])
    const { content, hash } = read.proposal
    expect(content.files.map((f) => [f.path, f.executable])).toEqual([['deploy/upload.sh', true], ['package-lock.json', false]])
    expect(content.executorImageDigest).toBe(DIGEST)
    expect(hash).toBe(await hashWorkflowVersion(content))
  })

  it('gives a different hash for a different image digest', async () => {
    const a = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(workspaceFiles())))
    const b = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(workspaceFiles()), { executorImageDigest: `sha256:${'2'.repeat(64)}` }))
    expect(a.ok && b.ok && a.proposal.hash !== b.proposal.hash).toBe(true)
  })

  it('refuses a link among the files, never following it', async () => {
    const files = { ...workspaceFiles(), '.workflows/deploy/deploy/upload.sh': 'link' as const }
    const read = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(files)))
    expect(read).toEqual({ ok: false, message: expect.stringContaining('is a link') })
  })

  it('refuses a definition path that climbs out of the workspace', async () => {
    const site = standInSite(workspaceFiles())
    const read = await readProposal('s', WS, '../other/workflow.yaml', sources(site))
    expect(read.ok).toBe(false)
    expect(site.asked).toEqual([])
  })

  it('refuses a definition core\'s parser refuses, saying where', async () => {
    const read = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(workspaceFiles({ ...DEFINITION, secret: ['X'] }))))
    expect(read.ok).toBe(false)
    expect(read.ok || read.message).toContain('secret')
    expect(read.ok || read.message).toMatch(/Nothing was changed\.$/)
  })

  it('refuses a secret or variable the place doesn\'t have, naming them', async () => {
    const definition = { ...DEFINITION, variables: ['STAGING_HOST', 'NODE_ENV'], steps: [...DEFINITION.steps, { name: 'More', secrets: ['MISSING_KEY'], run: 'true' }] }
    const read = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(workspaceFiles(definition))))
    expect(read.ok).toBe(false)
    expect(read.ok || read.message).toContain('no secret MISSING_KEY and no variable NODE_ENV')
  })

  it('doesn\'t look for GITHUB_TOKEN among the place\'s secrets: it is minted per run', async () => {
    const definition = { name: 'push', steps: [{ name: 'Push', secrets: ['GITHUB_TOKEN'], run: 'true' }], github: { contents: 'write' } }
    const read = await readProposal('s', WS, 'workflow.yaml', sources(standInSite({ 'workflow.yaml': { text: JSON.stringify(definition) } })))
    expect(read.ok).toBe(true)
  })

  it('passes on the site\'s refusal while it can\'t read workflow files yet', async () => {
    const notYet = { async readFiles(): Promise<WorkflowReadFilesResult> { return { ok: false, reason: 'workspace_missing', path: null, message: 'This site does not read workflow files yet. Nothing was changed.' } } }
    const read = await readProposal('s', WS, 'workflow.yaml', sources(standInSite({}), { sites: notYet }))
    expect(read).toEqual({ ok: false, message: 'This site does not read workflow files yet. Nothing was changed.' })
  })

  it('reads a definition with hq\'s YAML reader', async () => {
    const read = await readProposal('s', WS, '.workflows/deploy/workflow.yaml', sources(standInSite(workspaceFiles()), { readYaml: readWorkflowYaml }))
    expect(read.ok).toBe(true)
  })

  it('refuses YAML with aliases or duplicate keys, saying nothing was changed', () => {
    const alias = readWorkflowYaml('a: &x [1]\nb: *x\n')
    const dup = readWorkflowYaml('name: a\nname: b\n')
    expect(alias.ok).toBe(false)
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.message).toMatch(/Nothing was changed\.$/)
  })
})
