/**
 * The running Fleet Console hands its machines to a new one (spec §7; core's join.ts). A machine admin of the machine
 * it runs on asks for a one-time code through the control socket (`node dist/cli.js handover-code`, run by the host
 * service with `docker exec`), so the code reaches only that machine's command line; hq is given its lookup.
 *
 * When a new Fleet Console presents the lookup, hq passes its identity and binding here. Only a binding that needs the
 * code is answered, so hq — which never sees the code — cannot put an identity of its own in the new one's place.
 * The answer is a certificate naming the new identity, signed with this Fleet Console's key, which is what each
 * machine follows, sealed with the machines it pinned to the new identity, beside this Fleet Console's own binding.
 * The code then works no more.
 *
 * When this Fleet Console runs on another machine than hq's, the machine admin of hq's machine still gives the code
 * (spec §7): `agenthix hq console-code` there asks for it in an envelope its host service signs and seals here, and
 * the code goes back sealed to that host service alone. Only the pinned machine that carries hq is answered. Which
 * one that is, this Fleet Console knows from its own pins, never from hq: the mark is set when hq's machine joined at
 * install with a code from this Fleet Console's own command line, on that machine (join/joins.ts, `local`), and it
 * travels from one Fleet Console to the next only inside the sealed, signed handover. Nothing hq sends touches it.
 */
import { JOIN_CODE_TTL_MS, formatFingerprint, formatJoinCode, type HandoverCodeAnswer, type HostIdentity } from '@agenthix/core'
import {
  fingerprintOf, generateConsoleCode, isHostIdentity, consoleCodeLookup, oldConsoleBinding, sealEnvelope,
  signHandoverCertificate, verifyNewConsoleBinding, type HostKeys,
} from '@agenthix/core/host-crypto'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import type { PinnedHosts } from '../state/hosts'

const MACHINE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,62}$/u

export type HandoverOutDeps = {
  keys: HostKeys; link: HqLink; hosts: PinnedHosts; commands: HostCommands; activity: Activity; machineName: string
}

const ONLY_HQ_MACHINE =
  "Only HQ's machine may ask the Fleet Console for a code to move it: run agenthix hq console-code there. Nothing was made."

type Open = { handoverId: string; code: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }

/** Why a new Fleet Console was not answered, kept for the logs and the tests. Never the code. */
export type HandoverRefusal = 'not_open' | 'malformed' | 'bad_binding'

export class HandoverOut {
  private open: Open | null = null
  readonly refused: HandoverRefusal[] = []

  constructor(private readonly deps: HandoverOutDeps) {
    deps.link.on('handoverRequest', frame => {
      this.onRequest(frame).catch(err => console.error('[console] handover request failed:', err instanceof Error ? err.message : err))
    })
    deps.commands.onHandoverCodeAsk((from, askId) => this.onCodeAsk(from, askId))
  }

  /**
   * A code for the machine admin; any earlier one stops working. `askedOn`: hq's machine, when the code was asked for
   * there and this Fleet Console runs elsewhere.
   */
  async openCode(now = Date.now(), askedOn: string | null = null): Promise<{ code: string; expiresAt: string }> {
    const code = generateConsoleCode('handover')
    const expiresAt = now + JOIN_CODE_TTL_MS
    const { handoverId } = await this.deps.link.call('handover.open', {
      lookup: await consoleCodeLookup(code), expiresAt: new Date(expiresAt).toISOString(),
    })
    this.close()
    const timer = setTimeout(() => this.expire(handoverId), expiresAt - now)
    timer.unref?.()
    this.open = { handoverId, code, expiresAt, timer }
    const where = askedOn ? `asked for on HQ's machine, ${askedOn}` : 'made on that machine'
    await this.deps.activity.record(null, 'console.moveStarted',
      `A one-time code to move the Fleet Console from ${this.deps.machineName}, ${where}`, true)
    return { code: formatJoinCode(code), expiresAt: new Date(expiresAt).toISOString() }
  }

  /** A machine it manages asks for a code, sealed and signed by its host service; only hq's machine is given one. */
  async onCodeAsk(from: string, askId: string): Promise<void> {
    const host = this.deps.hosts.byFingerprint(from)
    if (!host) return
    let answer: HandoverCodeAnswer
    if (host.hqMachine !== true) {
      console.warn(`[console] ${host.machineName} asked for a code to move this Fleet Console; only HQ's machine may`)
      answer = { ok: false, problem: ONLY_HQ_MACHINE }
    } else {
      try {
        answer = { ok: true, ...(await this.openCode(Date.now(), host.machineName)) }
      } catch (err) {
        answer = { ok: false, problem: `The Fleet Console could not make a code: ${err instanceof Error ? err.message : 'HQ did not answer.'}` }
      }
    }
    const envelope = await sealEnvelope({
      sender: this.deps.keys, recipient: host.identity, message: { kind: 'handoverCode', replyTo: askId, answer },
    })
    this.deps.link.sendEnvelope(envelope)
  }

  /** hq passes a new Fleet Console's half. Anything that does not prove the code is refused, and nothing is sent. */
  async onRequest(frame: unknown, now = Date.now()): Promise<void> {
    const f = frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : {}
    const open = this.open
    if (!open || f.handoverId !== open.handoverId || open.expiresAt <= now) return this.refuse('not_open')
    const ask = f.ask && typeof f.ask === 'object' ? (f.ask as Record<string, unknown>) : {}
    if (!isHostIdentity(ask.identity) || ask.identity.role !== 'console' || typeof ask.binding !== 'string' ||
      typeof ask.machineName !== 'string' || !MACHINE_NAME.test(ask.machineName)) return this.refuse('malformed')
    const identity: HostIdentity = { role: 'console', signingKey: ask.identity.signingKey, sealingKey: ask.identity.sealingKey }
    const ownFp = await fingerprintOf(this.deps.keys.identity)
    const newFp = await fingerprintOf(identity)
    if (newFp === ownFp) return this.refuse('malformed')
    if (!(await verifyNewConsoleBinding(open.code, newFp, ask.binding))) return this.refuse('bad_binding')
    // Checked while the binding was: the code must still be this one, and is spent from here on.
    if (this.open !== open) return this.refuse('not_open')
    this.close()

    const machineName = ask.machineName
    const certificate = await signHandoverCertificate(this.deps.keys, identity, machineName)
    const envelope = await sealEnvelope({
      sender: this.deps.keys,
      recipient: identity,
      message: { kind: 'handoverState', certificate, hosts: this.deps.hosts.list() },
    })
    const k = this.deps.keys.identity
    await this.deps.link.call('handover.accept', {
      handoverId: open.handoverId,
      acceptance: {
        identity: { role: 'console', signingKey: k.signingKey, sealingKey: k.sealingKey },
        binding: await oldConsoleBinding(open.code, ownFp, newFp),
        envelope,
      },
    })
    await this.deps.activity.record(null, 'console.handedOver',
      `The Fleet Console on ${this.deps.machineName} handed its machines to the one on ${machineName} (${formatFingerprint(newFp)})`, true)
  }

  private refuse(reason: HandoverRefusal): void {
    this.refused.push(reason)
    if (this.refused.length > 20) this.refused.shift()
    console.warn(`[console] a request to take this Fleet Console's place was refused (${reason})`)
  }

  private expire(handoverId: string): void {
    if (this.open?.handoverId !== handoverId) return
    this.close()
    this.deps.link.call('handover.close', { handoverId }).catch(() => {})
  }

  private close(): void {
    if (this.open) clearTimeout(this.open.timer)
    this.open = null
  }
}
