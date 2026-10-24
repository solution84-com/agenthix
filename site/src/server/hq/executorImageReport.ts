/**
 * The executor image as the site's health report says it (core's `ExecutorImageReport`): the digest a workflow
 * version is hashed with and its steps start from, the release, and the tools stage's content key, which hq reads to
 * decide whether an approval survives an image upgrade (workflows spec part 1, *Image upgrades*).
 *
 * The digest is the published one — `EXECUTOR_IMAGE`'s repository at a digest Docker lists for it — or, for an
 * image built on this machine, which has none, its image id: the two forms the executor resolves a run's digest by.
 * The tools key is the image's `TOOLS_KEY_LABEL` label, set by the image build; an image without one reports none,
 * and hq then asks for every approval again rather than assume the tools are unchanged.
 */
import type { ExecutorImageReport } from '@agenthix/core'
import { executorImageName } from '../../agents/runtime/agentImage'

export const TOOLS_KEY_LABEL = 'tools-stage-key'

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

type Docker = (args: string[]) => Promise<{ stdout: string; stderr: string }>

/** `registry:5000/name:tag` or `name@sha256:…` → `registry:5000/name`. */
function repositoryOf(reference: string): string {
  const at = reference.indexOf('@')
  const withoutDigest = at >= 0 ? reference.slice(0, at) : reference
  const lastSlash = withoutDigest.lastIndexOf('/')
  const colon = withoutDigest.lastIndexOf(':')
  return colon > lastSlash ? withoutDigest.slice(0, colon) : withoutDigest
}

function digestOf(name: string, id: unknown, repoDigests: unknown): string | null {
  const pinned = name.includes('@') ? name.slice(name.indexOf('@') + 1) : null
  if (pinned && DIGEST_RE.test(pinned)) return pinned
  const repository = repositoryOf(name)
  if (Array.isArray(repoDigests)) {
    for (const entry of repoDigests) {
      if (typeof entry !== 'string' || !entry.includes('@')) continue
      const [repo, digest] = [entry.slice(0, entry.indexOf('@')), entry.slice(entry.indexOf('@') + 1)]
      if (repo === repository && DIGEST_RE.test(digest)) return digest
    }
  }
  return typeof id === 'string' && DIGEST_RE.test(id) ? id : null
}

/** Never throws: an image Docker can't describe is reported as not there. */
export async function executorImageReport(docker: Docker, name: string = executorImageName()): Promise<ExecutorImageReport> {
  const absent: ExecutorImageReport = { name, present: false, digest: null, release: null, toolsKey: null }
  let inspected: Record<string, unknown>
  try {
    const { stdout } = await docker(['image', 'inspect', '--format', '{{json .}}', name])
    const parsed: unknown = JSON.parse(stdout.trim())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return absent
    inspected = parsed as Record<string, unknown>
  } catch {
    return absent
  }
  const digest = digestOf(name, inspected.Id, inspected.RepoDigests)
  if (!digest) return absent
  const config = inspected.Config && typeof inspected.Config === 'object' ? (inspected.Config as Record<string, unknown>) : {}
  const labels = config.Labels && typeof config.Labels === 'object' ? (config.Labels as Record<string, unknown>) : {}
  const toolsKey = typeof labels[TOOLS_KEY_LABEL] === 'string' ? (labels[TOOLS_KEY_LABEL] as string) : null
  // The executor image comes with the site's own release, as the agent image does.
  return { name, present: true, digest, release: process.env.APP_VERSION || null, toolsKey: toolsKey || null }
}
