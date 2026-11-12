/**
 * The conversation lead's model in demo mode (ADR-0186): the scripted model, its scripts loaded once, as hq starts.
 * A problem in the scripts — one `loadDemoScripts` finds, or a tool call the demo does not allow — is logged with
 * every problem and stops hq, so it is found at start rather than in front of a visitor. With the setting off, this
 * module does nothing.
 */
import { readdir, readFile } from 'node:fs/promises'
import type { LanguageModel } from 'ai'
import { demoDataDir, DemoScriptError, isDemoMode, loadDemoScripts, type DemoScripts } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { createScriptedModel } from './scriptedModel'
import { demoLeadToolProblems, type LeadToolInput } from './tools'
import { demoTurnOf } from './turnFacts'
import { visitorSpaceFor } from './visitorSpace'
// Last: the registry's modules load the rest of the conversation layer, which reaches back here.
import { leadToolInput } from './registry'

const logger = new Logger('DemoLead')

export async function loadDemoLeadScripts(root: string, inputOf: LeadToolInput): Promise<DemoScripts> {
  const scripts = await loadDemoScripts(root, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
  const problems = demoLeadToolProblems(scripts, inputOf)
  if (problems.length > 0) throw new DemoScriptError(problems)
  return scripts
}

let loaded: Promise<DemoScripts> | null = null

function scripts(): Promise<DemoScripts> {
  if (!loaded) {
    loaded = loadDemoLeadScripts(demoDataDir(process.env), leadToolInput)
    loaded.catch((error: unknown) => {
      logger.error(`The demo scripts cannot be used, so hq stops: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
  }
  return loaded
}

let model: ((conversationId: string) => LanguageModel) | null = null

/** The scripted model for a call's conversation (its cache key). */
export function demoLeadModel(): (conversationId: string) => LanguageModel {
  model ??= createScriptedModel({ scripts, turnOf: demoTurnOf, spaceFor: visitorSpaceFor })
  return model
}

if (isDemoMode(process.env)) void scripts()
