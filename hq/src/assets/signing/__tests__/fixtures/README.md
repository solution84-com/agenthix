# Signing test fixtures

Real Sigstore material, so the verifier is tested against what Sigstore itself produces. Copied unchanged from
[sigstore/sigstore-conformance](https://github.com/sigstore/sigstore-conformance) (Apache-2.0), commit
`acb38c9ee4274fa058127e6a5a4cdb9e94e449e1`, `test/assets/bundle-verify/`:

| File | From | What it is |
|------|------|------------|
| `statement.txt` | `a.txt` | The signed bytes (stands in for a package's signed statement) |
| `keyless.sigstore.json` | `happy-path-v0.3/bundle.sigstore.json` | Keyless, Sigstore's public instance, Rekor v1 entry with inclusion proof. Signer: the conformance suite's GitHub Actions workflow on `refs/heads/main` |
| `keyless-rekor2.sigstore.json` | `rekor2-happy-path/bundle.sigstore.json` | Keyless, Rekor v2 entry and a timestamp authority's timestamp |
| `rekor2-trusted_root.json` | `rekor2-happy-path/trusted_root.json` | Sigstore's staging trust root, for the Rekor v2 bundle |
| `key-pair.sigstore.json`, `key-pair.pub` | `managed-key-happy-path/` | Signed with a key pair, with a Rekor v1 entry |
| `dsse.sigstore.json` | `happy-path-intoto-in-dsse-v3/bundle.sigstore.json` | A DSSE attestation envelope, which hq refuses |

`production-trusted_root.json` is Sigstore's production trust root as `npm run sigstore:refresh` fetched it on
2026-10-27, kept fixed here so the tests do not change when the shipped root is refreshed.

The remaining cases (a statement changed by one byte, a bundle without an inclusion proof, an expired root, key pairs
made in the test) are derived from these in the tests themselves.
