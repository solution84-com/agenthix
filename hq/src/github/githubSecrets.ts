/**
 * GitHub Actions secret relay (ADR-0037). Seals a value with the repo's public key
 * (libsodium sealed box) and PUTs it to GitHub Secrets. The platform persists no value —
 * the operator's secret goes straight to GitHub, which stores/injects/masks it.
 */
import _sodium from 'libsodium-wrappers'
import { githubFetch } from './githubClient'
import { resolveRepoApi } from './repoApi'
import type { RepoTarget } from '../storage/repoAttachmentService'

/** Seal `value` for `publicKeyB64` (GitHub's repo secrets public key). Pure. */
export async function sealSecret(value: string, publicKeyB64: string): Promise<string> {
  await _sodium.ready
  const s = _sodium
  const sealed = s.crypto_box_seal(s.from_string(value), s.from_base64(publicKeyB64, s.base64_variants.ORIGINAL))
  return s.to_base64(sealed, s.base64_variants.ORIGINAL)
}

/** Relay a secret to the target repo's GitHub Secrets. The platform persists no value. */
export async function setRepoSecret(target: RepoTarget, name: string, value: string): Promise<void> {
  const { owner, repo, token } = await resolveRepoApi(target)
  const keyRes = await githubFetch(token, `/repos/${owner}/${repo}/actions/secrets/public-key`)
  const { key_id, key } = (await keyRes.json()) as { key_id: string; key: string }
  const encrypted_value = await sealSecret(value, key)
  await githubFetch(token, `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value, key_id }),
  })
}
