/**
 * Checking an image's signature before it is fetched (host-management spec §11, adr-0117), with Sigstore's
 * `cosign`, which the host service's image carries. cosign is the verifier for the signatures it makes: it checks
 * the signing certificate against Sigstore's root of trust, the entry in its public transparency log, and that the
 * signed digest is the one the registry serves for the tag. The host service only names the signer it expects and
 * reads the digest back, then fetches by that digest, so what runs is exactly what was checked.
 *
 * Like Docker, cosign runs with an argument list the host service builds, never through a shell.
 */
import { spawn } from 'node:child_process'
import type { RunResult } from '../docker/docker'
import { isDigest, type Signer } from './published'
import { childEnv, type RegistryEnv } from './registryAuth'

export type CosignRunner = (args: string[], timeoutMs: number, env?: RegistryEnv) => Promise<RunResult>

export type SignatureCheck =
  | { kind: 'signed'; digest: string }
  /** The registry has no image under that name and tag. */
  | { kind: 'missing' }
  | { kind: 'unsigned' }
  /** Signed, but not by a signer expected for this version. */
  | { kind: 'wrongSigner' }
  /** The check could not be made — no network, the registry or the log not answering, no cosign. */
  | { kind: 'unchecked'; reason: string }

export const cosignCli: CosignRunner = (args, timeoutMs, env) =>
  new Promise(resolve => {
    const child = spawn('cosign', args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(process.env, env) })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => { if (stdout.length < 1024 * 1024) stdout += c.toString('utf8') })
    child.stderr.on('data', (c: Buffer) => { if (stderr.length < 1024 * 1024) stderr += c.toString('utf8') })
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: stderr || err.message })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })

/** The exact identity and issuer, never their `-regexp` forms: a signature from anything else does not match. */
export function verifyArgs(ref: string, signer: Signer): string[] {
  return ['verify', '--certificate-identity', signer.identity, '--certificate-oidc-issuer', signer.issuer, ref]
}

/** The one digest every verified signature covers; null when the output names none, or more than one. */
export function signedDigest(stdout: string): string | null {
  const line = stdout.split('\n').map(l => l.trim()).filter(l => l.startsWith('[')).pop()
  if (!line) return null
  let rows: unknown
  try {
    rows = JSON.parse(line)
  } catch {
    return null
  }
  if (!Array.isArray(rows) || rows.length === 0) return null
  const digests = new Set(rows.map(r => (r as { critical?: { image?: { 'docker-manifest-digest'?: unknown } } })?.critical?.image?.['docker-manifest-digest']))
  if (digests.size !== 1) return null
  const [digest] = digests
  return typeof digest === 'string' && isDigest(digest) ? digest : null
}

function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.replace(/^Error:\s*/, '').slice(0, 300) ?? ''
}

export function classify(result: RunResult): SignatureCheck {
  if (result.code === 0) {
    const digest = signedDigest(result.stdout)
    return digest ? { kind: 'signed', digest } : { kind: 'unchecked', reason: 'cosign did not say which content it checked' }
  }
  const said = result.stderr
  if (result.code === 127) return { kind: 'unchecked', reason: 'this host service has no cosign to check signatures with' }
  if (/MANIFEST_UNKNOWN|NAME_UNKNOWN|manifest unknown/i.test(said)) return { kind: 'missing' }
  if (/no matching (signatures|attestations)/i.test(said)) return { kind: 'wrongSigner' }
  if (/no signatures found/i.test(said)) return { kind: 'unsigned' }
  return { kind: 'unchecked', reason: lastLine(said) || `cosign stopped with code ${result.code}` }
}

/** `env` is the registry credential's client configuration, for a registry that is private. */
export async function checkSignature(run: CosignRunner, ref: string, signer: Signer, env?: RegistryEnv): Promise<SignatureCheck> {
  return classify(await run(verifyArgs(ref, signer), 3 * 60_000, env))
}
