/**
 * A proposal's content (workflows spec part 1, *A version*): the definition file and the files it names, read by the
 * site from the workspace with every link refused, parsed with core's rules, its secrets and variables checked
 * against the place, and hashed with the executor image's digest. Nothing here writes; `propose.ts` stores what
 * this answers. Every refusal ends "Nothing was changed.", since nothing was.
 */
import {
  INTEGRATION_SECRET_NAMES,
  checkVersionContent,
  hashWorkflowVersion,
  normaliseWorkflowPath,
  parseWorkflowDefinition,
  type WorkflowDefinition,
  type WorkflowDefinitionNote,
  type WorkflowRunWorkspace,
  type WorkflowVersionContent,
  type WorkflowVersionFile,
} from '@agenthix/core'
import type { YamlReader } from './definitionYaml'
import type { SiteCalls } from './siteWorkflows'

export type ProposalSources = {
  sites: Pick<SiteCalls, 'readFiles'>
  readYaml: YamlReader
  secretNames(): Promise<string[]>
  variableNames(): Promise<string[]>
  executorImageDigest: string
}

export type ProposalContent = {
  content: WorkflowVersionContent
  hash: string
  notes: WorkflowDefinitionNote[]
}

export type ProposalReading = { ok: true; proposal: ProposalContent } | { ok: false; message: string }

const NOTHING = ' Nothing was changed.'
const refuse = (message: string): ProposalReading => ({ ok: false, message: message.endsWith(NOTHING.trim()) ? message : message + NOTHING })

export async function readProposal(
  siteId: string, workspace: WorkflowRunWorkspace, rawPath: string, src: ProposalSources, githubSecretNames: string[] = [],
): Promise<ProposalReading> {
  const normalised = normaliseWorkflowPath(rawPath)
  if (!normalised.ok) return refuse(normalised.reason)
  const definitionPath = normalised.path
  const folder = definitionPath.includes('/') ? definitionPath.slice(0, definitionPath.lastIndexOf('/')) : ''
  const inWorkspace = (p: string) => (folder ? `${folder}/${p}` : p)

  const read = await src.sites.readFiles(siteId, workspace, [definitionPath])
  if (!read.ok) return refuse(read.message)
  const definitionFile = read.files.find((f) => f.path === definitionPath)
  if (!definitionFile) return refuse(`The site didn't send ${definitionPath}.`)

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(definitionFile.contentBase64, 'base64'))
  } catch {
    return refuse(`${definitionPath} isn't UTF-8 text.`)
  }
  const yaml = src.readYaml(text)
  if (!yaml.ok) return refuse(yaml.message)
  const parsed = parseWorkflowDefinition(yaml.data)
  if (!parsed.ok) {
    const lines = parsed.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
    return refuse(`${definitionPath} can't be proposed:\n- ${lines.join('\n- ')}\n`)
  }
  const definition = parsed.definition

  const missing = await missingNames(definition, src)
  if (missing) return refuse(missing)

  const files: WorkflowVersionFile[] = []
  if (definition.files.length) {
    const wanted = definition.files.map(inWorkspace)
    if (wanted.includes(definitionPath)) return refuse(`${definitionPath} can't also be one of its own files.`)
    const got = await src.sites.readFiles(siteId, workspace, wanted)
    if (!got.ok) return refuse(got.message)
    const byPath = new Map(got.files.map((f) => [f.path, f]))
    for (const p of definition.files) {
      const f = byPath.get(inWorkspace(p))
      if (!f) return refuse(`The site didn't send ${inWorkspace(p)}.`)
      files.push({ path: p, bytes: new Uint8Array(Buffer.from(f.contentBase64, 'base64')), executable: f.executable })
    }
    if (got.files.length !== definition.files.length) return refuse('The site sent files the definition doesn\'t name.')
  }

  const content: WorkflowVersionContent = { definition, files, githubSecretNames, executorImageDigest: src.executorImageDigest }
  const problems = checkVersionContent(content)
  if (problems.length) return refuse(`This version can't be proposed: ${problems.join(' ')}`)
  return { ok: true, proposal: { content, hash: await hashWorkflowVersion(content), notes: parsed.notes } }
}

/** The secrets and variables the definition names that the place doesn't have; integration values aren't stored. */
async function missingNames(d: WorkflowDefinition, src: ProposalSources): Promise<string | null> {
  const integration = new Set<string>(INTEGRATION_SECRET_NAMES)
  const named = [...new Set(d.steps.flatMap((s) => s.secrets))].filter((n) => !integration.has(n)).sort()
  const [secrets, variables] = await Promise.all([src.secretNames(), src.variableNames()])
  const haveSecrets = new Set(secrets)
  const haveVariables = new Set(variables)
  const noSecret = named.filter((n) => !haveSecrets.has(n))
  const noVariable = d.variables.filter((n) => !haveVariables.has(n))
  if (!noSecret.length && !noVariable.length) return null
  const parts: string[] = []
  if (noSecret.length) parts.push(`no secret ${noSecret.join(', ')}`)
  if (noVariable.length) parts.push(`no variable ${noVariable.join(', ')}`)
  return `This place has ${parts.join(' and ')}. Ask an administrator of this place to add ${noSecret.length + noVariable.length > 1 ? 'them' : 'it'} in the Vault, then propose again. Nothing was changed.`
}
