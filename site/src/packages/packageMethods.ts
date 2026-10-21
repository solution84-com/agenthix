/**
 * The two package methods hq calls (ruling P1): `packages.missing` on the
 * control channel, `packages.put` on the content transport.
 *
 * A content handler must end its own half, and must read with 'data'/'end'
 * listeners rather than `for await`, which destroys the stream before it can
 * reply (Phase 5 open item "Content handlers must end their half").
 */
import { PACKAGE_METHODS, PACKAGE_MAX_BYTES, isPackageRef, type PackagesMissingResult } from '@agenthix/core'
import type { ContentHandler } from '../server/hq/content/contentMethods'
import { missingPackages, storeVerifiedPackage } from './packageCache'
import { Logger } from '../server/utils/logger'

const logger = new Logger('PackageMethods')

let afterStored: (() => void) | null = null

/** Eviction registers here (Task 12); nothing runs when unset. */
export function setAfterPackageStored(hook: (() => void) | null): void {
  afterStored = hook
}

export async function handlePackagesMissing(params: unknown): Promise<PackagesMissingResult> {
  const refs = (params as { refs?: unknown } | null)?.refs
  if (!Array.isArray(refs) || !refs.every(isPackageRef)) {
    throw new Error(`${PACKAGE_METHODS.missing}: refs must be package references`)
  }
  return { missing: await missingPackages(refs) }
}

export const handlePackagesPut: ContentHandler = (stream, params) =>
  new Promise<void>((resolve, reject) => {
    const ref = (params as { ref?: unknown } | null)?.ref
    if (!isPackageRef(ref)) {
      reject(new Error(`${PACKAGE_METHODS.put}: ref must be a package reference`))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > PACKAGE_MAX_BYTES * 2) {
        // Stop reading at once. The destroy waits a turn so the caller's
        // failure (which names this reason) reaches hq before the stream's
        // own generic cancellation does.
        stream.removeListener('data', onData)
        stream.pause()
        reject(new Error(`${PACKAGE_METHODS.put}: transfer exceeds the package size limit`))
        setImmediate(() => stream.destroy())
        return
      }
      chunks.push(chunk)
    }
    stream.on('data', onData)
    stream.on('error', reject)
    stream.on('end', () => {
      storeVerifiedPackage(ref, Buffer.concat(chunks))
        .then(() => new Promise<void>(done => stream.end(() => done())))
        .then(() => {
          // The stream has already ended — a throwing hook must never turn
          // into a rejection here.
          try {
            afterStored?.()
          } catch (err) {
            logger.warn(`after-store hook failed: ${err instanceof Error ? err.message : String(err)}`)
          }
          resolve()
        })
        .catch(reject)
    })
  })
