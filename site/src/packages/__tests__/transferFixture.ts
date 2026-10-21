import { createHash } from 'node:crypto'
import { PACKAGE_FORMAT_VERSION, packageDigestInput, type PackageContents, type PackageRef, type PackageTransfer } from '@agenthix/core'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

/** A well-formed transfer for the given files, and the ref it verifies against. */
export function makeTransfer(kind: PackageRef['kind'], key: string, files: Record<string, string>): { ref: PackageRef; body: Buffer } {
  const contents: PackageContents = {
    formatVersion: PACKAGE_FORMAT_VERSION,
    files: Object.entries(files).map(([p, c]) => ({ path: p, sha256: sha(Buffer.from(c)) })),
  }
  const ref: PackageRef = { kind, key, digest: sha(packageDigestInput(contents)) }
  const transfer: PackageTransfer = { ref, contents, data: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, Buffer.from(c).toString('base64')])) }
  return { ref, body: Buffer.from(JSON.stringify(transfer)) }
}
