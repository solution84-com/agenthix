import { CLAUDE_SDK_RUNTIME } from './types'

/**
 * The model a run is launched with: the one hq dispatched it with — hq chooses each run's model and resolves its
 * credential for that model, so the session's model, written once when the session was made, may be stale — else
 * the session's, else the agent's. The Claude SDK takes a model without its date suffix.
 */
export function runModel(
  runtime: string,
  sessionModel: string | null,
  dispatchedModel: string | null,
  agentModel: string,
): string {
  const model = dispatchedModel ?? sessionModel ?? agentModel
  return runtime === CLAUDE_SDK_RUNTIME ? model.replace(/-\d{8}$/, '') : model
}
