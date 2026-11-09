/**
 * `keep_listening` (voice that stays in the conversation, spec §2; ADR-0179; plan task 4.4), as hq offers it: the tool
 * itself, its description and the rule for a hold are the lead's voice logic (lead/voiceLogic.ts); this binds it to
 * the `voiceBridge` flag and the tool adapter. It is offered on every turn that is offered tools while the flag is on,
 * so the tools a provider caches are the same for a typed turn and a spoken one.
 *
 * hq intercepts it in the turn (turn.ts); it never goes through the tool adapter. On a spoken message whose reply has
 * started no work, the turn ends there: no message, no second model call, the reason logged, and the holder told
 * (`turnHeld`). On any other turn a call is ignored as a failed call, and the turn goes on as it would.
 */
import type { ConversationTool, ToolAdapter } from '../contract'
import { voiceBridgeFeatureOn } from '../../voice/bridgeFlag'
import { KEEP_LISTENING, KEEP_LISTENING_DESCRIPTION, NOT_HELD, keepListeningInput } from '../lead/voiceLogic'

export { KEEP_LISTENING, KEEP_LISTENING_DESCRIPTION, NOT_HELD, canHold, holdReason } from '../lead/voiceLogic'

export function createKeepListeningTool(deps: { featureOn(): Promise<boolean> }): ConversationTool {
  return {
    name: KEEP_LISTENING,
    input: keepListeningInput,
    describe: async () => KEEP_LISTENING_DESCRIPTION,
    offered: async capability => capability.trigger !== 'REPORT' && (await deps.featureOn()),
    // Reached only if a call ever bypassed the turn's interception: never a hold.
    run: async () => NOT_HELD,
  }
}

export const keepListeningTool = createKeepListeningTool({ featureOn: voiceBridgeFeatureOn })

/** The tool adapter with a keep_listening call answered as not held, without running it. */
export function ignoringKeepListening(tools: ToolAdapter): ToolAdapter {
  return {
    toolsFor: capability => tools.toolsFor(capability),
    call: (capability, call, options) => (call.name === KEEP_LISTENING ? Promise.resolve(NOT_HELD) : tools.call(capability, call, options)),
    readsOnly: (capability, call) => call.name === KEEP_LISTENING || (tools.readsOnly?.(capability, call) ?? false),
  }
}
