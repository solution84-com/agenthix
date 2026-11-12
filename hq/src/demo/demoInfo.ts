/**
 * `getDemoInfo` (live demo spec): whether this hq is the demo, when it next resets, and what each agent's scripts
 * answer — the prompts shown under the composer and the lines a visitor can say on the voice screen. Asked by the
 * entry page before anyone signs in, so it needs no session; with the setting off it says only `{ on: false }`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { DEMO_CLOSING_LINES, demoDataDir, loadDemoScripts, nextDemoReset, type DemoScripts } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { demoOn } from './demoMode'

const logger = new Logger('Demo')

/** A line the voice screen offers, and the recorded clip that speaks the agent's answer to it (null: shown as text only). */
export type DemoVoiceLineInfo = { id: string; text: string; clip: string | null }

export type DemoAgentInfo = {
  suggestedPrompts: string[]
  voiceLines: DemoVoiceLineInfo[]
  /** What the agent says first in a voice conversation, and its clip. */
  firstVoiceLine: { text: string; clip: string | null }
  /**
   * The lead's own closing lines (work came back, done, refused, waiting) and their clips. `prefix`: the line opens a
   * longer message (a refusal, followed by its reason).
   */
  spokenLines: { text: string; clip: string | null; prefix: boolean }[]
}

export type DemoInfo =
  | { on: false }
  | { on: true; nextResetAt: string; agents: Record<string, DemoAgentInfo> }

let scripts: Promise<DemoScripts | null> | null = null

/** The demo's scripts, read once; null when they cannot be read (said once in the log, and the demo has no prompts). */
function demoScripts(): Promise<DemoScripts | null> {
  scripts ??= loadDemoScripts(demoDataDir(process.env), { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
    .catch((err: unknown) => {
      logger.error('the demo scripts could not be read', err)
      return null
    })
  return scripts
}

/** For tests: read the scripts again at the next use. */
export function forgetDemoScriptsForTests(): void {
  scripts = null
}

export function agentsInfo(loaded: DemoScripts | null): Record<string, DemoAgentInfo> {
  if (!loaded) return {}
  return Object.fromEntries(Object.entries(loaded.agents).map(([handle, { lead }]) => [handle, {
    suggestedPrompts: [...lead.suggestedPrompts],
    voiceLines: lead.voiceLines.map(line => ({
      id: line.intent, text: line.text, clip: lead.intents.find(i => i.id === line.intent)?.voiceClip ?? null,
    })),
    firstVoiceLine: { text: lead.firstVoiceLine.text, clip: lead.firstVoiceLine.voiceClip },
    spokenLines: DEMO_CLOSING_LINES.map(key => ({
      text: lead.spoken[key].text, clip: lead.spoken[key].voiceClip, prefix: key === 'refused',
    })),
  }]))
}

export async function demoInfo(now = new Date()): Promise<DemoInfo> {
  if (!demoOn()) return { on: false }
  return { on: true, nextResetAt: nextDemoReset(now).toISOString(), agents: agentsInfo(await demoScripts()) }
}

export const getDemoInfo = async (_args: unknown, _context: unknown): Promise<DemoInfo> => demoInfo()
