import { describe, it, expect } from 'vitest'
import _sodium from 'libsodium-wrappers'
import { sealSecret } from '../githubSecrets'

// The only pure, deterministically-testable piece of the operations layer.
// The GitHub-API paths (set/list/dispatch) are exercised by the VPS smoke test (plan Task 5),
// not mocked — GitHub is the source of truth.
describe('sealSecret — GitHub Actions secret sealing @SC-235', () => {
  it('produces a sealed box that the holder of the matching private key can open', async () => {
    await _sodium.ready
    const s = _sodium
    const kp = s.crypto_box_keypair()
    const pubB64 = s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL)

    const sealedB64 = await sealSecret('my-deploy-secret', pubB64)
    const opened = s.crypto_box_seal_open(
      s.from_base64(sealedB64, s.base64_variants.ORIGINAL),
      kp.publicKey,
      kp.privateKey,
    )

    expect(s.to_string(opened)).toBe('my-deploy-secret')
  })

  it('seals to different ciphertext each call (sealed boxes are non-deterministic)', async () => {
    await _sodium.ready
    const s = _sodium
    const kp = s.crypto_box_keypair()
    const pubB64 = s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL)

    const a = await sealSecret('same-value', pubB64)
    const b = await sealSecret('same-value', pubB64)
    expect(a).not.toBe(b)
  })
})
