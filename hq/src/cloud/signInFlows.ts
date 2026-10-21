/**
 * The sign-ins waiting on Cloud (pre-release spec C2): for each, the values it is bound by — `state`, `nonce`, the
 * PKCE verifier — and what it is for, kept in this process for at most `CLOUD_SIGN_IN_MAX_WAIT_S`.
 *
 * hq keeps its session out of cookies, so `state` alone does not tie a return to the browser that left. Each flow
 * therefore also has a **browser binding**, a secret handed to the page that started it and kept in that tab's
 * session storage; a return is taken only with it, so a code from someone else's sign-in cannot be planted in
 * another person's browser. Only the binding's hash is kept. A flow is taken once.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { CLOUD_SIGN_IN_MAX_WAIT_S } from '@agenthix/core'
import { newCloudFlowValue } from '@agenthix/core/cloud-crypto'

export type FlowPurpose = { kind: 'signIn' } | { kind: 'link'; userId: string }

export type SignInFlow = { state: string; nonce: string; verifier: string; purpose: FlowPurpose; expiresAt: number }

/** Enough for any organisation's people signing in at once; beyond it the oldest is dropped. */
const MAX_FLOWS = 1000

const hash = (value: string) => createHash('sha256').update(value).digest()

export class SignInFlows {
  private readonly flows = new Map<string, SignInFlow & { binding: Buffer }>()

  constructor(private readonly now: () => number = Date.now) {}

  start(purpose: FlowPurpose): { flow: SignInFlow; binding: string } {
    this.sweep()
    while (this.flows.size >= MAX_FLOWS) this.flows.delete(this.flows.keys().next().value!)
    const binding = newCloudFlowValue()
    const flow: SignInFlow = {
      state: newCloudFlowValue(), nonce: newCloudFlowValue(), verifier: newCloudFlowValue(), purpose,
      expiresAt: this.now() + CLOUD_SIGN_IN_MAX_WAIT_S * 1000,
    }
    this.flows.set(flow.state, { ...flow, binding: hash(binding) })
    return { flow, binding }
  }

  /** The flow `state` names, spent whether or not it matches, when `binding` is its own and it has not lapsed. */
  take(state: string, binding: string): SignInFlow | null {
    const found = this.flows.get(state)
    if (!found) return null
    this.flows.delete(state)
    if (found.expiresAt <= this.now() || !timingSafeEqual(found.binding, hash(binding))) return null
    const { binding: _kept, ...flow } = found
    return flow
  }

  private sweep(): void {
    const now = this.now()
    for (const [state, flow] of this.flows) if (flow.expiresAt <= now) this.flows.delete(state)
  }
}
