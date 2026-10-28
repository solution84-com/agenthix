# Installing from Anywhere

An asset can come from hq's own image, from an upload or from a link on any web server. Agenthix is not prescriptive about where; it requires **one open protocol**, and every source goes through the same check ([ADR-0158](../../adr/adr-0158-an-asset-is-installed-from-anywhere-through-one-signed-protocol.md)). Where a package came from only decides how hq fetches it.

## The protocol

1. **A package**: a ZIP holding `package.json` (kind, name, version, publisher, "based on") and the asset's files, skills in the [Agent Skills](https://agentskills.io) format. A plain skill folder with only a `SKILL.md` is accepted and counts as unsigned.
2. **A fingerprint**: one digest over every file, `package.json` included, sorted by path. The **signed statement** is the kind, publisher, name, version and fingerprint written as canonical JSON. A package with two entries of one name, names that differ only by letter case or how an accent is encoded, or hidden system files is refused.
3. **A signature**: a detached [Sigstore](https://www.sigstore.dev) bundle beside the package (`package.sigstore.json`; for a link, `<link>.sigstore.json`). It is **keyless**, as an identity such as a release workflow, or made with a **key pair** whose public key the organisation added.
4. **The check**: hq verifies the signature against the signed statement, then against whom the organisation trusts. It needs no network: Sigstore's trust root ships in hq's image and is refreshed each release. A keyless signature must carry its transparency-log proof. The trust root's age is shown, and a check against one older than a year says so and refuses.

## Four states

| State | What HQ says | What it allows |
|---|---|---|
| **Signed by someone trusted** | "Signed by **Agenthix**" | Install |
| **Signed by someone new** | "Signed by **github.com/acme/skills**. You haven't installed anything from them before. A signature tells you who published it, not that it's safe." | Trust this publisher and install; install this once; or cancel |
| **Unsigned** | "This isn't signed. Agenthix can't tell who made it or whether it was changed on the way. Read it before you install it." | Install after ticking "I've read it", if the organisation allows unsigned assets |
| **Signature doesn't match** | "This was changed after it was signed." | Refused, with no override |

A signature that cannot be checked at all (an unreadable file, a missing transparency-log proof, a key nobody added, an expired trust root) is refused too, with the reason.

**Verification is not endorsement.** Agenthix vouches that a signer is who they say they are, never that an asset is safe. The person installing is always told the two things that matter: that it is unsigned, or who signed it. Before confirming, they see what comes with it: "This template brings 7 skills: 5 for its role, 1 you already have, 1 newer than yours, update offered." What is installed is exactly the fingerprint they were shown.

## Who signs

| Signer | Shown as |
|---|---|
| **An organisation's release workflow**, keyless (recommended) | "Signed by **Acme** (github.com/acme, workflow `release.yml`)" |
| **An organisation's own key** | "Signed by **Acme**", the name the administrator gave the key |
| **A person's own identity**, accepted because the protocol is open | "Signed by **a person**, alice@example.com, not an organisation" |

An organisation signs because it outlives its people. A keyless signature proves a repository and a workflow, not that the account is an organisation: HQ shows exactly what is proven, and the administrator names the publisher when trusting it.

**A trusted keyless publisher is bound exactly.** The issuer, the exact certificate identity (less the ref it ran from, since a workflow's identity ends in the ref), the source repository, and the refs allowed (tags, or the one named branch) are all compared as written, with no pattern. A feature branch that can run the release workflow cannot sign as the publisher. **A key-pair publisher is trusted by adding its public key first**; it is revoked by removing the key, and needs no transparency-log entry, so an organisation's key can sign offline. A removed publisher's name is never given to a different signer.

## After installing

The asset records its source, fingerprint, signer or *Unsigned*, and who installed it and when, shown on its page. **An update keeps the signer**: a newer version is an update only when the same verified signer signed it. A different signer, or an unsigned package, is a different asset ([identity](./library.md#identity)). Assets made in HQ need no signature; they are signed only when someone exports and signs them to share. Skills in files are not installed packages, so none of this applies to them ([skills in files](../skills/skills-in-files.md)).

## The organisation's settings

Manage organisation › Settings › Library and skills, for administrators.

| Setting | Default |
|---|---|
| **Trusted publishers**: the identities and keys the organisation trusts. Agenthix is always on the list | Agenthix only |
| **Unsigned assets**: *Allowed after a warning*, or *Never* (made-here skills are unaffected) | Allowed after a warning |
| **Who may install from outside**: *Administrators*, or *Administrators and Library maintainers* | Administrators |

Installing from hq's image (the shelf) is open to maintainers either way.

## Sources

| Source | How |
|---|---|
| **hq's own image** | Agenthix's packages. The image is signed and verified before it runs, so they are Agenthix's by where they are |
| **An upload** | A ZIP or a folder, with its signature file if there is one |
| **A link** | A ZIP on any web server, such as a GitHub release, its signature beside it |

A link is fetched cautiously because it is aimed at hq's own network: `https` only, on the standard port, with no credentials sent. The address is resolved once and pinned, anything that is not a public internet address is refused (on each redirect too, at most three), and the package must fit the size cap (8 MB) within a time limit. Every failure says the same thing. hq installs and never publishes, and no organisation runs a registry through hq.

## Related

- [library.md](./library.md)
- [architecture/skills-and-assets.md](../../architecture/skills-and-assets.md#the-install-pipeline): the pipeline, step by step
