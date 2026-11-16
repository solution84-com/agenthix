/**
 * What a conversation's turn is offered (conversation layer spec, Tool execution contract; ADR-0193): every tool it
 * may use under its capability, each with its area, those at Ask with a required reason. The tool adapter shows the
 * must-haves of it and folds the rest (foldedTools.ts).
 */
import { z } from 'zod'
import { allowOnce, isTurnTool, turnToolAsks, turnToolState } from '../../server/controlplane/turnCaller'
import { CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS } from '../../server/controlplane/toolSchemas'
import type { ConversationTool, LeadToolDefinition, OfferedTool, TurnCapability } from '../contract'
import { toolCallTitle, turnToolDefinitions } from './turnTools'
import { ASK_NOTE, withReason } from '../work/toolCalls/ask'
import { leanToolsFor } from './leanTaskTools'
import { fold } from './foldedTools'

/** The control plane's tools a turn may ever call, for offering those at Ask. */
const TURN_TOOL_SCHEMAS = [...CONTROL_PLANE_TOOLS, ...WORKFORCE_TOOLS].filter(t => isTurnTool(t.name))

/** Whether the turn may call this conversation tool only by asking: at Ask, and offered once a person says yes. */
export async function ownToolAsks(tool: ConversationTool, capability: TurnCapability): Promise<boolean> {
  return turnToolState(capability.permissions, tool.name) === 'ask' && (await tool.offered(allowOnce(capability, tool.name)))
}

function askDefinition<T extends LeadToolDefinition>(tool: T): T {
  return { ...tool, description: `${tool.description}\n\n${ASK_NOTE}`, input: withReason(tool.input) }
}

/** A control-plane tool as the lead is offered it: in its lean versions where it has them (leanTaskTools.ts). */
function leanOffers(defs: readonly OfferedTool[], asks: boolean): OfferedTool[] {
  return defs.flatMap(d => {
    const lean = leanToolsFor(d.name)
    if (lean.length === 0) return [asks ? askDefinition(d) : d]
    return lean.map(l => {
      const tool = { name: l.name, area: l.area, description: l.description, input: z.object(l.schema) }
      return asks ? askDefinition(tool) : tool
    })
  })
}

/**
 * Every tool the turn may use under this capability, `own` the conversation's own tools: those it may use now, and
 * those at Ask with their reason. Never a tool at Never.
 */
export async function leadToolOffer(capability: TurnCapability, own: readonly ConversationTool[]): Promise<OfferedTool[]> {
  // A report turn speaks and starts no work: it is offered nothing.
  if (capability.trigger === 'REPORT') return []
  // A conversation's own version of a tool (run_task, create_task) replaces the control plane's for a turn.
  const offers = await Promise.all(own.map(async t => {
    if (await t.offered(capability)) return { tool: t, asks: false }
    return (await ownToolAsks(t, capability)) ? { tool: t, asks: true } : null
  }))
  const offered = offers.filter((t): t is NonNullable<typeof t> => t !== null)
  const ownNames = new Set(own.map(t => t.name))
  const asking = TURN_TOOL_SCHEMAS
    .filter(t => !ownNames.has(t.name) && turnToolAsks(capability, t.name))
    .map(t => ({ name: t.name, area: t.area, description: t.description ?? `${toolCallTitle(t.name)}.`, input: z.object(t.schema) }))
  return [
    ...leanOffers(turnToolDefinitions(capability).filter(t => !ownNames.has(t.name)), false),
    ...leanOffers(asking, true),
    ...(await Promise.all(offered.map(async ({ tool, asks }) => {
      const offer = { name: tool.name, area: tool.area ?? 'conversation', description: await tool.describe(capability), input: tool.input }
      return asks ? askDefinition(offer) : offer
    }))),
  ]
}

/**
 * The tools the lead is shown under this capability: its must-haves, those that apply now, and find_tools and
 * use_tool for the rest (foldedTools.ts). What a turn's toolsFor gives, and what the model checks (__modelchecks__)
 * send, with the few whose description reads the database scripted.
 */
export async function leadToolDefinitions(capability: TurnCapability, own: readonly ConversationTool[]): Promise<LeadToolDefinition[]> {
  return fold(await leadToolOffer(capability, own)).shown
}

/** A turn's offer, worked out once for its toolsFor, its area lines and its searches: the capability is the turn's. */
export function offerCache(offerOf: (capability: TurnCapability) => Promise<OfferedTool[]>, keep = 32) {
  const byTurn = new Map<string, Promise<OfferedTool[]>>()
  return (capability: TurnCapability): Promise<OfferedTool[]> => {
    const key = JSON.stringify(capability)
    let offer = byTurn.get(key)
    if (!offer) {
      offer = offerOf(capability)
      offer.catch(() => byTurn.delete(key))
      byTurn.set(key, offer)
      if (byTurn.size > keep) byTurn.delete(byTurn.keys().next().value!)
    }
    return offer
  }
}

