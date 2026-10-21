import { dockerWithin } from '../../agents/runtime/containerLifecycle'
import { agentImageName } from '../../agents/runtime/agentImage'

/** Can this machine run a container, and is its agent image here? `detail` is prose for an operator. */
export type SiteRuntimeCheckResult = {
  containerRuntime: 'available' | 'unavailable'
  /** Why, in prose, when it is unavailable; the runtime's version when it is. */
  detail: string
  agentImage: string
  imagePresent: boolean
}

const RUNTIME_CHECK_TIMEOUT_MS = 10_000

export interface RuntimeCheckDeps {
  docker?: (args: string[]) => Promise<{ stdout: string; stderr: string }>
  siteRoot?: string
  image?: string
}

/**
 * Two questions, answered separately and never merged: is there a container
 * runtime, and is the agent image on this machine. A working runtime with no
 * image is the ordinary first-boot state, and reporting it as "no runtime"
 * sends an operator to fix something that is not broken.
 *
 * Never throws. A missing runtime is an answer, not a fault — an exception
 * here would reach hq as a channel failure and be reported as "the site is
 * unreachable", which is a different and wrong thing to tell an operator.
 */
export async function runtimeCheck(deps: RuntimeCheckDeps = {}): Promise<SiteRuntimeCheckResult> {
  const docker = deps.docker ?? ((args: string[]) => dockerWithin(args, RUNTIME_CHECK_TIMEOUT_MS))
  const image = deps.image ?? agentImageName()

  try {
    const { stdout } = await docker(['version', '--format', '{{.Server.Version}}'])
    let imagePresent = false
    try {
      const listed = await docker(['image', 'ls', '-q', image])
      imagePresent = listed.stdout.trim().length > 0
    } catch {
      imagePresent = false
    }
    return {
      containerRuntime: 'available',
      detail: stdout.trim() || 'running',
      agentImage: image,
      imagePresent,
    }
  } catch (err) {
    return {
      containerRuntime: 'unavailable',
      detail: err instanceof Error ? err.message : String(err),
      agentImage: image,
      imagePresent: false,
    }
  }
}
