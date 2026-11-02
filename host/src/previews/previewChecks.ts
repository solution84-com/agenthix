/**
 * The preview address's three checks (live preview spec section 5), run on *Save* and *Check again* and kept
 * for the figures: DNS sends every name under the domain where HQ's own name goes; this machine's port 443 answers the
 * check name with a certificate a browser accepts; and the relay itself answers the check name through whatever passes
 * it on. Live apps read **On** only when all three pass.
 */
import { PREVIEW_CHECK_ID, newAppId, type PreviewCheck, type PreviewsFigures } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { hostOf } from '../frontDoor/config'
import { frontDoorSettings } from '../frontDoor/frontDoor'
import { machineProbes } from '../frontDoor/probes'
import { machinePreviewProbes, type PreviewProbes } from './previewProbes'

/** The front door asks for the check name's certificate on its first open: the certificate authority takes a while. */
const CERTIFICATE_WAIT_MS = 90_000
const CERTIFICATE_POLL_MS = 5_000

// Beside HQ's settings, so it goes with HQ.
const CHECKS_FILE = ['hq', 'previews.json'] as const

const probes = (ctx: Context): PreviewProbes => ctx.previewProbes ?? machinePreviewProbes
const certificateProbe = (ctx: Context) => (ctx.frontDoorProbes ?? machineProbes).certificate

/** Runs the three checks for `domain`, keeps what they found, and says each as a step. */
export async function checkPreviews(ctx: Context, domain: string, hqHost: string, progress: (p: Progress) => void): Promise<PreviewsFigures> {
  const checkName = `p-${PREVIEW_CHECK_ID}.${domain}`
  const checks: PreviewCheck[] = []
  const said = async (step: string, run: () => Promise<PreviewCheck>) => {
    progress({ event: 'step', step })
    const check = await run()
    progress({ event: 'stepDone', outcome: check.ok ? 'passes' : 'fails' })
    checks.push(check)
  }

  await said(`DNS for *.${domain}`, async () => {
    // A name nobody set on its own, so only the wildcard record answers it.
    const [addresses, expected] = await Promise.all([probes(ctx).resolve(`p-${newAppId()}.${domain}`), probes(ctx).resolve(hqHost)])
    const ok = addresses.length > 0 && (expected.length === 0 || addresses.some(a => expected.includes(a)))
    return { name: 'dns', ok, addresses, expected }
  })
  await said(`Certificate for ${checkName}`, async () => {
    const waits = frontDoorSettings(ctx)?.on === true
    const until = ctx.now().getTime() + (waits ? CERTIFICATE_WAIT_MS : 0)
    for (;;) {
      const got = await certificateProbe(ctx)(checkName)
      if (got.ok) return { name: 'certificate', ok: true, problem: null }
      if (ctx.now().getTime() >= until) return { name: 'certificate', ok: false, problem: got.problem }
      await ctx.sleep(CERTIFICATE_POLL_MS)
    }
  })
  await said(`A test app at ${checkName}`, async () => {
    const got = await probes(ctx).checkAnswer(checkName)
    return got.ok ? { name: 'testApp', ok: true, problem: null } : { name: 'testApp', ok: false, problem: got.problem }
  })

  const figures: PreviewsFigures = { domain, checkedAt: ctx.now().toISOString(), checks }
  ctx.state.writeJson([...CHECKS_FILE], figures)
  return figures
}

/** The preview address as HQ has it and its last checks, kept only while they were for that address. */
export function previewsFigures(ctx: Context): PreviewsFigures | undefined {
  const hq = installed(ctx).hq?.settings
  if (!hq) return undefined
  const domain = hq.previewDomain ?? null
  const kept = ctx.state.readJson(...CHECKS_FILE) as PreviewsFigures | null
  return kept && domain !== null && kept.domain === domain ? kept : { domain, checkedAt: null, checks: [] }
}
