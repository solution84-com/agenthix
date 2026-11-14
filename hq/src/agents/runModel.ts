/**
 * The model a piece of work runs on (models from one place, part 4), through the one resolver: a task's run, a
 * conversation's worker and its helpers, a chat run. Work takes the model an instruction names; else, for a
 * conversation's work, the model that conversation talks on; else the agent's default model, else the
 * organisation's. The runtime follows the model and its provider.
 *
 * With nothing that may run, the choice carries the resolver's problem and no model: the run is still dispatched,
 * and fails on the site with that reason (`credentialProblem`), as an unattended run fails today.
 */
import type { AgentRuntimeName, ModelViaProvider, Resolution, ResolvePlace } from '@agenthix/core'
import { CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME } from '@agenthix/core'
import { resolve } from '../routing/resolver'
import { placeOfBoundary } from '../routing/place'
import { runtimeFor, runtimeModelId } from '../routing/modelKeys'
import { routeProviders } from '../routing/snapshot'

export type RunChoice = {
  /** The model as the runtime takes it; empty when nothing may run. */
  model: string
  runtime: AgentRuntimeName
  resolution: Resolution | null
  problem: string | null
}

export async function chooseRunModel(input: {
  agentId: string
  place: ResolvePlace
  userId?: string | null
  pick?: ModelViaProvider
  /** The conversation the work is handed off from: its model is the work's first choice. */
  conversationId?: string | null
  purpose?: 'worker' | 'helper'
}): Promise<RunChoice> {
  const answer = await resolve({
    purpose: input.purpose ?? 'worker',
    place: input.place,
    agentId: input.agentId,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.pick ? { pick: input.pick } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  })
  if (!answer.ok) return { model: '', runtime: CLAUDE_SDK_RUNTIME, resolution: null, problem: answer.problem.message }
  const r = answer.resolution
  const runtime = r.runtime ?? CLAUDE_SDK_RUNTIME
  return { model: runtimeModelId(runtime, r.vendor, r.model.model), runtime, resolution: r, problem: null }
}

/** A run in a boundary — a person's own storage or a project's — for the agent, on behalf of the person. */
export async function chooseBoundaryRun(
  boundary: { type: 'user' | 'project'; id: string } | null, agentId: string, userId: string | null, pick?: ModelViaProvider | null,
  conversationId?: string | null,
): Promise<RunChoice> {
  return chooseRunModel({ agentId, place: await placeOfBoundary(boundary), userId, ...(pick ? { pick } : {}), conversationId })
}

/**
 * A run that carries on in a session kept on its own runtime and model (a run an approval was given for, or one paused
 * for a scheduled change): the same model, via the first provider that serves it on that runtime, so the run is given
 * the provider of the model it carries on with. With none, it still carries on with its own model, and the choice
 * carries the problem.
 */
export async function chooseKeptSessionRun(input: {
  agentId: string
  boundary: { type: 'user' | 'project'; id: string } | null
  userId: string | null
  session: { runtime: string; model: string }
}): Promise<RunChoice> {
  const place = await placeOfBoundary(input.boundary)
  const providers = await routeProviders(place.kind === 'own' ? place.userId : null)
  for (const p of providers) {
    const prefix = `${p.vendor}/`
    const model = input.session.runtime === CLAUDE_SDK_RUNTIME ? input.session.model
      : input.session.model.startsWith(prefix) ? input.session.model.slice(prefix.length) : null
    if (!model || runtimeFor(p.vendor, p.credentialKind, model) !== input.session.runtime) continue
    const choice = await chooseRunModel({ agentId: input.agentId, place, userId: input.userId, pick: { providerId: p.id, model } })
    if (choice.resolution) return choice
  }
  // Another model would not run in this session: it carries on with its own, and the site fails it with the reason.
  return {
    model: input.session.model,
    runtime: input.session.runtime === OPENCODE_RUNTIME ? OPENCODE_RUNTIME : CLAUDE_SDK_RUNTIME,
    resolution: null,
    problem: `This run carries on in a session on ${input.session.model}, and no working provider here serves that model on the runtime the session began on. An organisation admin can add one under Manage organisation › AI, under Your providers.`,
  }
}
