/**
 * Loading the whole demo data set. hq and the site each load it once at start in demo mode and refuse to start on a
 * problem, so a broken script is found at once rather than in front of a visitor.
 *
 * The folder is read through a `DemoFolderReader` the caller gives (node's `fs` on a server), so core stays free of
 * Node; `parseDemoFiles` does the checking on what was read.
 */
import { DEMO_SCRIPT_LIMITS, type DemoAgentScripts, type DemoScripts } from './scripts.js'
import { DEMO_ID, DEMO_VOICE_CLIP, Problems, readDemoLeadScript, readDemoRunScript, type DemoScriptProblem } from './parse.js'

export type DemoFolderReader = {
  /** The names (not paths) of the entries in a folder; throws when it does not exist. */
  list(dir: string): Promise<string[]>
  /** A file's text, as UTF-8. */
  read(file: string): Promise<string>
}

/** What was read: each JSON file by its path relative to the data folder, and the names of the clips in `voice/`. */
export type DemoFiles = {
  json: { path: string; text: string }[]
  voiceClips: string[]
}

export class DemoScriptError extends Error {
  constructor(readonly problems: DemoScriptProblem[]) {
    super(`The demo scripts have ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n` +
      problems.map(p => `  ${p.at}: ${p.message}`).join('\n'))
  }
}

const visible = (names: string[]) => names.filter(n => !n.startsWith('.')).sort()

export async function readDemoFolder(root: string, reader: DemoFolderReader): Promise<DemoFiles> {
  const json: DemoFiles['json'] = []
  const take = async (path: string) => { json.push({ path, text: await reader.read(`${root}/${path}`) }) }
  for (const name of visible(await reader.list(`${root}/agents`))) await take(`agents/${name}`)
  for (const handle of visible(await reader.list(`${root}/runs`))) {
    for (const name of visible(await reader.list(`${root}/runs/${handle}`))) await take(`runs/${handle}/${name}`)
  }
  return { json, voiceClips: visible(await reader.list(`${root}/voice`)) }
}

const AGENT_FILE = /^agents\/([^/]+)\.json$/
const RUN_FILE = /^runs\/([^/]+)\/([^/]+)\.json$/

/** Checks every file and how they fit together; throws `DemoScriptError` with every problem found. */
export function parseDemoFiles(files: DemoFiles): DemoScripts {
  const p = new Problems()
  const agents: Record<string, DemoAgentScripts> = {}
  const runs: { handle: string; at: string; script: NonNullable<ReturnType<typeof readDemoRunScript>> }[] = []
  const clips = new Set(files.voiceClips)
  for (const clip of files.voiceClips) if (!DEMO_VOICE_CLIP.test(clip)) p.add(`voice/${clip}`, 'A clip is named like writer-hello.mp3.')

  for (const { path, text } of files.json) {
    let value: unknown
    try { value = JSON.parse(text) } catch { p.add(path, 'Not valid JSON.'); continue }
    const agentFile = AGENT_FILE.exec(path)
    const runFile = RUN_FILE.exec(path)
    if (agentFile) {
      if (!DEMO_ID.test(agentFile[1])) { p.add(path, 'The file is named for the agent\'s handle.'); continue }
      const lead = readDemoLeadScript(p, path, agentFile[1], value)
      if (lead) agents[lead.agent] = { lead, runs: [] }
    } else if (runFile) {
      if (!DEMO_ID.test(runFile[1]) || !DEMO_ID.test(runFile[2])) { p.add(path, 'runs/<handle>/<id>.json, in ids.'); continue }
      const script = readDemoRunScript(p, path, runFile[2], value)
      if (script) runs.push({ handle: runFile[1], at: path, script })
    } else p.add(path, 'Only agents/<handle>.json and runs/<handle>/<id>.json are read.')
  }

  for (const { handle, at, script } of runs) {
    const agent = agents[handle]
    if (!agent) p.add(at, `No agents/${handle}.json for these runs.`)
    else agent.runs.push(script)
  }
  const handles = Object.keys(agents)
  if (!files.json.some(f => AGENT_FILE.test(f.path))) p.add('agents', 'At least one agent\'s lead script.')
  if (handles.length > DEMO_SCRIPT_LIMITS.agents) p.add('agents', `At most ${DEMO_SCRIPT_LIMITS.agents} agents.`)
  for (const handle of handles) checkAgent(p, handle, agents[handle], clips)

  if (p.list.length) throw new DemoScriptError(p.list)
  return { agents }
}

function checkAgent(p: Problems, handle: string, agent: DemoAgentScripts, clips: Set<string>): void {
  const { lead, runs } = agent
  if (runs.length > DEMO_SCRIPT_LIMITS.runsPerAgent) p.add(`runs/${handle}`, `At most ${DEMO_SCRIPT_LIMITS.runsPerAgent} runs.`)
  const defaults = runs.filter(r => 'default' in r.for).length
  if (runs.length > 0 && defaults !== 1) p.add(`runs/${handle}`, 'Exactly one run script is for { "default": true }.')
  const targets = new Set<string>()
  for (const r of runs) {
    const key = JSON.stringify(r.for)
    if (targets.has(key)) p.add(`runs/${handle}/${r.id}.json`, `Another run script is for ${key}.`)
    targets.add(key)
  }
  const named = [
    ...lead.intents.map(i => [`intents.${i.id}`, i.voiceClip] as const),
    ['fallback', lead.fallback.voiceClip] as const,
    ['firstVoiceLine', lead.firstVoiceLine.voiceClip] as const,
    ...Object.entries(lead.spoken).map(([key, line]) => [`spoken.${key}`, line.voiceClip] as const),
  ]
  for (const [at, clip] of named) if (clip && !clips.has(clip)) p.add(`agents/${handle}.json.${at}`, `No voice/${clip}.`)
}

/** Reads and checks the data set at `root` (`demoDataDir`). */
export async function loadDemoScripts(root: string, reader: DemoFolderReader): Promise<DemoScripts> {
  return parseDemoFiles(await readDemoFolder(root, reader))
}
