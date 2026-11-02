/** The few Docker questions the live preview's code asks, each answered strictly: an answer that does not read is an error. */
import { dockerWithin } from '../../../agents/runtime/containerLifecycle'

export const LIVE_PREVIEW_DOCKER_TIMEOUT_MS = 30_000

export const lpDocker = (args: string[]) => dockerWithin(args, LIVE_PREVIEW_DOCKER_TIMEOUT_MS)

/** One container's `docker inspect`, or null when Docker has no such container. */
export async function inspectContainer(ref: string): Promise<unknown | null> {
  let stdout: string
  try {
    ;({ stdout } = await lpDocker(['inspect', '--type', 'container', ref]))
  } catch (err) {
    if (/no such (object|container)/i.test(String(err))) return null
    throw err
  }
  const parsed: unknown = JSON.parse(stdout)
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`docker inspect gave no single container for ${ref}`)
  return parsed[0]
}

/** The image's id and size in bytes. */
export async function imageFacts(image: string): Promise<{ id: string; size: number }> {
  const { stdout } = await lpDocker(['image', 'inspect', '--format', '{{.Id}} {{.Size}}', image])
  const [id, size] = stdout.trim().split(/\s+/)
  if (!/^sha256:[0-9a-f]{64}$/.test(id ?? '') || !/^\d+$/.test(size ?? '')) throw new Error(`docker could not describe the image ${image}`)
  return { id: id!, size: Number(size) }
}

/** The lines of a `docker … ls`/`ps` answer. */
export async function listed(args: string[]): Promise<string[]> {
  const { stdout } = await lpDocker(args)
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}
