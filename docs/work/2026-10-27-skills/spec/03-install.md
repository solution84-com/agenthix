# 3 · Installing from anywhere

Part of the [Skills and the asset layer spec](../spec.md). Board 2d.

Agenthix isn't prescriptive about where an asset comes from (D7). It requires one open protocol, and every source goes
through the same check. Where a package came from only decides how hq fetches it.

## The protocol (D8)

1. **The package:** the library package ZIP that already exists: `package.json` (kind, name, version, publisher,
   `basedOn`) and the asset's files, skills in the Agent Skills format. A plain skill folder with only a `SKILL.md` is
   accepted and counts as unsigned.
2. **The fingerprint:** one digest over every file, `package.json` included, sorted by path, in the canonical form
   library packages already use (`packageDigestInput`: path plus sha256, canonical JSON), over exactly the files
   stored. **The signed statement** is the canonical JSON `{format, kind, publisher, name, version, fingerprint}`.
   Duplicate ZIP entries, paths that differ only by case or Unicode normalisation, and entries skipped as metadata are
   refused (security review H1).
3. **The signature:** a detached Sigstore bundle beside the package (`package.sigstore.json`), the format the platform
   already uses for its own images (adr-0117). Keyless, as an identity, or with a key pair, with the public key added
   to hq's trusted keys. Sigstore's trust root ships in hq's image, refreshed each release, so checking works offline.
4. **The check:** hq verifies the signature against the signed statement, then against whom the organisation
   trusts. A keyless bundle must carry its transparency-log inclusion proof, verified offline against the shipped trust
   root; the trust root's age is shown, and a check with an expired one says so. hq has no Sigstore verifier today
   (only the host service's online `cosign`), so the implementation plan chooses the library hq verifies with.

## The four states

| | State | What hq says | What it allows |
|---|---|---|---|
| S1 | Signed by someone trusted | "Signed by **Agenthix**" | Install |
| S2 | Signed by someone new | "Signed by **github.com/acme/skills**. You haven't installed anything from them before. A signature tells you who published it, not that it's safe." | Trust this publisher and install; install this once; or cancel |
| S3 | Unsigned | "This isn't signed. Agenthix can't tell who made it or whether it was changed on the way. Read it before you install it." | Install after ticking "I've read it", if the organisation allows unsigned assets (D26) |
| S4 | Signature doesn't match | "This was changed after it was signed." | Refused, no override |

**Verification is not endorsement.** Agenthix vouches that a signer is who they say they are, never that an asset is
safe. The person installing is always told the two things that matter: that it's unsigned, or who signed it.

## Who signs (D9)

| | Signing identity | Shown as |
|---|---|---|
| W1 | **The organisation's release workflow**, keyless (recommended) | "Signed by **Acme** (github.com/acme, workflow `release.yml`)" |
| W2 | **The organisation's own key** | "Signed by **Acme**", the name the administrator gave the key |
| W3 | **A person's own identity**, accepted because the protocol is open | "Signed by **a person**, alice@example.com, not an organisation" |
| W4 | Both an organisation and the member who released it | Not used: who inside an organisation released something stays internal |

**A trusted keyless publisher is bound exactly** (security review H2): the issuer, the exact certificate identity
less the ref it ran from (no pattern match; a workflow's identity ends in `@<ref>`, which would make every tag release
a new signer), and the source repository and ref from the certificate's extensions, checked on their own: tags or
the default branch only, so a feature branch that can run the release workflow can't sign as the publisher. The ref is
shown beside the identity. **A key-pair publisher is trusted by adding its public key first**: a key-pair bundle
names its key but doesn't carry it, so an unknown key can't be checked and is refused as unverifiable rather than
offered as a new publisher (S2 applies to keyless signers). A key-pair publisher is revoked by removing its key, and
needs no transparency-log entry, so an organisation's key can sign offline. W3 shows the identity provider beside the
email.

The organisation signs because it outlives its people, so trust doesn't reset when a maintainer leaves. A keyless
signature proves a repository and workflow, not that the account is an organisation: hq shows exactly what is proven,
the administrator names the publisher when trusting it, and "Verified organisation" is kept for a hosted registry's
later check.

## After installing

The asset records its source, fingerprint, signer or *unsigned*, and who installed it and when, shown on its page.
**Updates keep the signer:** a newer version is an update only when the same verified publisher signed it. A
different signer, or an unsigned package, is a different asset ([part 2](02-assets.md#identity)), never an update. Assets made in hq need no signature; they are signed only when exported to share. Skills in
files are not installed packages, so this check doesn't apply to them ([part 4](04-files.md)).

## The organisation's settings

| | Setting | Default |
|---|---|---|
| P1 | Trusted publishers: the identities and keys this organisation trusts; Agenthix is always on it | Agenthix only |
| P2 | Unsigned assets: allowed after the warning, or never | Allowed after the warning |
| P3 | Who may install from outside | Administrators |

## Sources

| Source | How | In this unit |
|---|---|---|
| hq's own image | Agenthix's packages, signed in the release build | Yes |
| Upload | A ZIP or folder, with its signature file if there is one | Yes |
| A URL | A ZIP on any web server, such as a GitHub release, its signature beside it | Yes |
| A git repository | Skill folders in a repository; private ones need credentials through workflows | Later |
| A hosted registry | Published packages with verified publishers, one source among the others | Later |

hq installs and never publishes. No organisation runs a registry.

**Fetching from a URL** (security review M3): HTTPS only; the address is resolved once and pinned; private, loopback,
link-local and unique-local addresses are refused, and checked again on each redirect (at most 3); the body is
streamed under the package size cap with a timeout; no credentials are sent; errors are generic. The signature is
fetched under the same rules from `<url>.sigstore.json`. Every source is read with the existing ZIP reader's bounds
(`packageZip.ts`: entry cap, streamed byte cap, links refused, paths checked).
