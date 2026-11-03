/**
 * Secrets in a live preview's app container (live preview spec section 4, *Secrets*; adr-0171). Only a run of the
 * place's approved *Start live preview* or *Reload live preview* workflow hands them, once its steps passed: the
 * executor calls `handSecrets`, and nothing else does. They go to the app's container alone, never to an agent's
 * container, the copy, a log or an event:
 *
 * - **Where:** one file per name in `LIVE_PREVIEW_SECRETS_DIR`, a memory-backed folder of the container's own
 *   (`SECRETS_TMPFS`), so a value is never on the machine's disk. The files are readable by the image's user, which
 *   runs the apps, and by nothing outside the container. They go when the container goes: at a stop, or a pause that
 *   removed it. A later run replaces them all.
 * - **How:** a fixed script the site runs in the container, outside the launcher, as the image's user, which empties
 *   the folder and unpacks the values from its standard input. A value is never on a command line or in an
 *   environment.
 * - **Masked:** from then on, every line of the live preview's apps and installs the site sends on (to hq and to the
 *   agent) is masked against the run's masking material, as a workflow's output is (adr-0148). The material stays
 *   here, inside a function `previewMasks.ts` holds, so nothing an agent's route reaches holds it; never a value.
 *
 * Only the executor imports this module.
 */
import { INTEGRATION_SECRET_NAMES, type WorkflowMaskingMaterial } from '@agenthix/core'
import { createMasker } from '../../../executor/seams'
import { valuesArchive } from '../../../executor/stepContainer'
import { helperInPreview } from '../container/exec'
import { siteExecBegins } from '../livePreviewActivity'
import { setPreviewMask, type PreviewMask } from './previewMasks'
import { HANDED_BYTES_MAX, SECRETS_SCRIPT, SECRETS_SCRIPT_NAME } from './secretsFolder'

const HAND_TIMEOUT_MS = 30_000

export const secretsArgv = (): string[] => ['sh', '-c', SECRETS_SCRIPT, SECRETS_SCRIPT_NAME]

/** The run could not hand its secrets to the live preview; its message is the person's and never quotes a value. */
export class HandOffFailed extends Error {}

export type HandOffDeps = {
  exec: (id: string, argv: string[], stdin: Uint8Array, timeoutMs: number) => Promise<{ exitCode: number; stdout: string }>
}

export const handOffDeps: HandOffDeps = {
  exec: (id, argv, stdin, timeoutMs) => helperInPreview(id, argv, timeoutMs, stdin),
}

/** The secrets a run's steps name, by name, without the values minted for the run; the last step's value wins. */
export function secretsToHand(steps: { secrets: Record<string, string> }[]): Record<string, Buffer> {
  const out: Record<string, Buffer> = {}
  for (const step of steps) {
    for (const [name, base64] of Object.entries(step.secrets)) {
      if ((INTEGRATION_SECRET_NAMES as readonly string[]).includes(name)) continue
      out[name] = Buffer.from(base64, 'base64')
    }
  }
  return out
}

/**
 * Hands `secrets` to the live preview's app container, replacing what an earlier run handed, and masks its output
 * from then on. Throws `HandOffFailed` when the container did not take them.
 */
export async function handSecrets(id: string, secrets: Record<string, Buffer>, material: WorkflowMaskingMaterial): Promise<void> {
  const archive = valuesArchive(secrets, {})
  try {
    if (archive.length > HANDED_BYTES_MAX) {
      throw new HandOffFailed(`The secrets the workflow names come to more than ${HANDED_BYTES_MAX} bytes, more than a live preview holds, so none were handed to the app.`)
    }
    // Masking starts before any value is in the container, so no line the app prints with one goes out unmasked.
    setPreviewMask(id, maskWith(material))
    const done = siteExecBegins(id)
    let answer: { exitCode: number; stdout: string }
    try {
      answer = await handOffDeps.exec(id, secretsArgv(), archive, HAND_TIMEOUT_MS)
    } catch {
      throw new HandOffFailed('The live preview\'s container is not running as the site made it, so its secrets were not handed to the app.')
    } finally {
      done()
    }
    if (answer.exitCode !== 0 || answer.stdout.trim() !== 'handed') {
      throw new HandOffFailed('The live preview\'s container did not take the secrets, so the app does not have them.')
    }
  } finally {
    archive.fill(0)
    for (const value of Object.values(secrets)) value.fill(0)
  }
}

/** Masks text against `material` in every form, as a workflow's output is masked. */
function maskWith(material: WorkflowMaskingMaterial): PreviewMask {
  return async text => {
    if (text === '') return text
    const masker = createMasker(material)
    const head = await masker.push(Buffer.from(text, 'utf8'))
    const tail = await masker.end()
    return Buffer.concat([head, tail]).toString('utf8')
  }
}
