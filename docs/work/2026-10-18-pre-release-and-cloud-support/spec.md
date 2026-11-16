---
created: 2026-10-18
description: The first pre-release's guide and screenshots, and what a hosted controller and a hosted sign-in need from the platform — the host service driven by Agenthix Cloud, an hq connecting to Cloud, what the platform shows of Cloud, and what a client other than the browser needs from hq.
---

# Design Spec · The first pre-release, and the platform's side of Agenthix Cloud

**Kind:** initiative, in five parts · **Builds on:** host management as built (its spec in
[`../2026-10-13-host-management/spec.md`](../2026-10-13-host-management/spec.md)), the conversational experience, and
the desktop shell · **Boards:** `boards/` (part D's screens, made in phase 4 and committed there)

## Why

Two things wait on the platform. The website builds its documentation from `docs/guide/` at a release tag, with the
screenshots from `assets.agenthix.com/guide/<tag>/`, and no tag has been made: the capture workflow has failed since
host management landed, and a pre-release has never been cut. And Agenthix Cloud, the hosted service, runs an
organisation's hq and sites on its own machines through the host service, connects to a self-hosted hq, and signs
people in with an Agenthix account. Host management built the contracts for that and refuses every message from
Cloud. This unit builds the platform's side, so that the hosted service can be finished against the real thing.

## Parts

| Part | Delivers | Verified here against |
|---|---|---|
| **A** | The guide and its screenshots ready for a pre-release, and how one is cut | The real workflows, on the unit's branch |
| **B** | The host service takes Cloud's controller on Cloud's machines | Unit and integration tests, with a stand-in controller |
| **C** | An hq connects to Agenthix Cloud and offers sign-in with an Agenthix account | A stand-in Cloud server |
| **D** | What the platform shows of Cloud, and the Responsible AI Pledge card | Unit tests, end-to-end tests, the boards |
| **E** | What a client other than the browser needs from hq | Unit and integration tests |

Parts B, C and E are proven end to end only when Cloud's own side runs against them; that is outside this repository.

## The flag: a blanket Cloud switch goes

`core/src/naming/features.ts` has one flag, `cloud`, that turns every Cloud feature off in a production build. Cloud
is offered from the platform's first release, so a blanket switch no longer fits. **The `cloud` flag is removed.**
Each Cloud feature is governed by its own real condition instead: this machine is enrolled with Cloud, this hq is
connected, this person's account is linked. A self-hosted hq that is not connected shows the not-connected states
part D describes and never calls Cloud.

**Every Cloud feature ships at the first release; none is held back** (owner). A flag built into a release cannot
choose who sees what, since anyone may run any build, so holding a feature back for a trial is not done with one:
that would be a later feature, in which hq asks Cloud what applies to it (remote configuration), designed when it is
needed. The Responsible AI Pledge goes live with the platform on 17 November (owner), so the
`pledge` flag is removed too and the flag module with it; no flag is left.

## Part A — the guide and screenshots for a pre-release

### A1. The capture workflow passes

From the run logs of *Guide screenshots*:

- **`diagnostics`** waits for **Download support bundle**, which since host management is shown to fleet admins only.
  The sample's administrator, Sam, is not one. **The guide seed makes Sam a fleet admin**, which is what the page
  shows to the person the guide is written for, and keeps the picture's alt text and the support-bundle steps true.
- **`agent-instructions`** timed out once on the Instructions **Edit** button and passed on retry: it waits for the
  section to be ready before clicking.
- Any recipe the desktop shell broke is fixed the same way: the recipe follows the screen; the screen is not changed
  for a recipe.
- **The pictures say what is true:** the server's clock text is masked and the sample's dates are fixed; the
  capture environment sets `HQ_STORAGE_ROOT`.
- **The workflows are linted:** `actionlint` and `shellcheck` on every workflow, the findings fixed, and a check on
  pull requests.

### A2. The Fleet Console's screens are captured

The guide's *Running Agenthix* pages describe the Fleet Console, and none has a picture: the recipes run against hq.
The Fleet Console needs a host service to show anything, and the capture runner has none. **Its recipes run the
Fleet Console's built screens against a sample of its own API**, answered by Playwright's request routing: the same
sample organisation, typed with `@agenthix/core`'s types so a change to the API that the sample no longer matches
fails the typecheck. A recipe is named `console-<name>.recipe.ts`, its picture `console-<name>`, and the name check
covers both apps.

### A3. The guide matches the screens

Every page of `docs/guide/` is read against the screens as they are now: the steps, the words, the screenshot names
and their alt text. Where a page needs a picture that does not exist, a recipe is added. The capture workflow also
fails if a page names a picture no recipe makes, as it does today.

### A4. Pre-releases

Tags are `v1.0.0-beta.N` while features still land, `v1.0.0-rc.N` once the scope is frozen, and `v1.0.0`. The
website's production build reads GitHub's *latest release*, which is never a pre-release, so nothing a pre-release
publishes reaches the live site; a staging copy of the website pins the tag.

- *Guide screenshots* runs on any `v*` tag (path filters do not apply to tags) and keeps that run's release set.
- *Publish guide screenshots* accepts a pre-release tag and writes `guide/<tag>/` once; a later beta is a new tag.
- Nothing in this repository calls the website's rebuild; the website's own side starts it.
- A pre-release tag also publishes the images (part B, B1).
- **A tag's screenshots are published right after its capture run passes.** The next run compares against the
  nearest earlier tag's published set, and fails if it is missing.

The procedure — tag, mark the GitHub release as a pre-release, wait for the capture run, publish as a dry run, then
for real — is written in the guide's README, under *Publishing screenshots at a release*, and the release steps for
images in [`deployment.md`](../../architecture/deployment.md), including making the image packages public at the
first release.

## Part B — the host service takes Cloud's controller

Cloud's controller drives a machine through the host service with the same signed and sealed envelopes and the same
closed set of operations as the Fleet Console. Everything in part B applies **only on a machine enrolled with
Cloud** and only to requests from Cloud's pinned identity, recorded as `by: { kind: 'cloud' }`. A machine an
organisation runs itself never enrols, and nothing here changes what the Fleet Console or the command line may do
there. On a machine Cloud runs, Agenthix is the machine admin; that is why the narrow exceptions in B6 and B9 add no
authority the operator does not already have. Request and answer shapes follow those Cloud has proposed, adjusted to
the platform's conventions where they differ.

### B1. Published, signed images, also from a pre-release

- `publish-images.yml` runs for `v<major>.<minor>.<patch>` and for `-beta.N` and `-rc.N`; the host service accepts a
  pre-release version as published (`isPublishedVersion`), and the signer it expects stays the workflow run for that
  version's own tag. The host test that holds the workflow's tag form follows.
- **Registry credentials.** While the image packages are private, a machine needs a credential to pull them. The host
  service reads `AGENTHIX_REGISTRY_USERNAME` and `AGENTHIX_REGISTRY_TOKEN` from `/etc/agenthix/host.env` when both are
  set, writes them to a Docker configuration of its own (mode `0600`, under the host service's state, never the
  machine's), and uses it for the image pull and for the signature check, which reads the same registry. They are
  never logged, never put in an envelope, and never reach hq, a site or an agent. **They are for machines that pull
  private images**, which Cloud's staging machines do; once the packages are public, neither is needed.
- A fresh machine installs from the published images by its start-up settings alone. Proven when the first tag
  publishes; here, the install path is tested against a local registry.

### B2. Cloud's connection and enrolment

- **The host service dials Cloud; nothing dials the machine.** It is the host link, pointed at Cloud's address
  (`AGENTHIX_CLOUD_URL`, path `/host-link`, relay protocol major `1`, `X-Host-Relay-Version`).
- **Enrolment by a one-time code**, valid once and for at most an hour, read from the file
  `AGENTHIX_CLOUD_ENROLMENT_CODE_FILE` names (root-only, `0600`), deleted once spent. It uses the Fleet Console's join
  derivation (lookup, binding key) with **a `cloud` role in the fingerprint**, so a Cloud code can never be replayed
  as a Fleet Console join or the reverse. The host service dials with `X-Host-Join: <lookup>`, sends `host.join`, and
  gets `host.joined` with its machine id, or `host.joinRefused`. Any failed join spends the code. Each side pins the
  other's keys.
- **Reconnecting:** `X-Host-Id: <machine id>`; the first frame must be a fresh signed envelope from the pinned
  identity, never seen before. There is no bearer secret, and the connection does nothing until that frame arrives.
- **One controller per machine.** A machine with a Fleet Console pinned refuses enrolment; a machine enrolled with
  Cloud refuses a Fleet Console's join (B5).
- **It keeps working when hq is down**: the connection does not pass through hq.

### B3. The front door takes the certificate and files host it is given

`frontDoor.set { on: true, confirmPorts: true, filesHost, certificate, privateKey }` arrives sealed, and again at each
renewal. With a certificate given, the front door serves it and **does not try ACME**: the machine's firewall admits
only Cloud's edge, so an ACME attempt could only time out. A given `filesHost` is kept through `address.set` and
through install, never reset to `files.<hq host>`. With none given and `files.<hq host>` not routed, uploads are
downloads only, as [ADR-0114](../../adr/adr-0114-uploaded-files-are-served-from-their-own-origin.md) says for a bare
address. Previews ([ADR-0071](../../adr/adr-0071-a-preview-is-served-from-its-own-host-name.md)) stay off on Cloud's
machines.

### B4. The backup location, set by the controller

`backup.location.set { endpoint, bucket, prefix, region, accessKeyId, secretAccessKey, sessionToken, expiresAt, key }`
points backups at an S3-compatible store under the machine's own prefix; a backup is stored at
`<prefix><backup id>`. The credentials are short-lived (at most 7 days), reach only that prefix, and carry a session
token. Asked again before they lapse, it replaces only the credentials and answers `{ expiresAt }`. `key` (base64url,
32 bytes) is the location's key, which a copy there is restored with
(`backup.restore { source: { from: 'location', key } }`). The store keeps every backup for 30 days and refuses to
delete one sooner, so **the host service's pruning treats a refused delete as expected** and leaves expiry to the
store. Sent sealed after enrolment, never in the start-up settings; none of it is logged. A self-hosted machine's
backup location stays a folder set on the machine.

### B5. On Cloud's machines, the Fleet Console does not claim the machine

The Fleet Console starts beside hq, with remote access off, and the machine stays Cloud's controller's.

### B6. Cloud's sites join hq

On the hq's own machine, relayed to hq: `site.register { machineId, siteName, credentialHash }` — hq accepts the
site's credential by its SHA-256 hash only and shows the site as Cloud's; asked again for the same `machineId` it
answers the same `{ executionSiteId }` and changes nothing; another site with that name answers `conflict`.
`site.unregister { executionSiteId }` retires the site and forgets its credential, answering `{ removed }`, so it is
safe to repeat. `erase` names the hq's address, so the right hq is erased. These replace, for Cloud, the Fleet
Console's own link ([ADR-0115](../../adr/adr-0115-a-site-takes-part-when-a-fleet-admin-or-cloud-adds-it.md)).

### B7. The account operations

The one exception to "a controller never gets admin links", on machines Cloud runs:

- **`account.firstLink { ref }`** — a fresh one-time link to make the first admin, only while hq has no account. Each
  new link ends the one before. hq keeps `ref` (Cloud's random name for the link, never its secret) with the account
  the link makes. Once any account exists it answers
  `{ state: 'hasAccounts', accounts, firstAdmin: { madeAt, madeWith: { kind: 'firstLink', ref } | { kind: 'other' } } }`
  and never a link.
- **`account.resetLink { username }`** — a one-time link to set an **active organisation admin's** password;
  `not_found` otherwise, the same whether or not the account exists.
- **`account.adminInvite`** — a one-time invitation for a new organisation admin, only while no active organisation
  admin is left; `conflict` otherwise.
- Link answers are `{ link, expiresAt }`, https only; no link is logged. **Every use is announced in hq** to every
  admin, as done from Cloud.

### B8. The maintenance window

`upgrades.set { auto, window: { day: 0–6 | null, startMinute, endMinute, timeZone } }` — the setting the command line
already has, which Cloud sets for its machines. The window carries its time zone; moving it or turning fixes off
moves or cancels the fixes it had scheduled, as the command line does. The answer is the settings now held.

### B9. Remote access to a Fleet Console Cloud runs

Host management's rule is that Cloud can never turn remote access on. **On a machine Cloud runs, and only there, it
may**, because Agenthix is that machine's admin; on an organisation's own machine the rule is unchanged.

- The browser reaches the Fleet Console directly at a name Cloud gives; Cloud opens one port on the machine's
  firewall to the address of the person who turned it on, after they accepted the risks; TLS ends at the Fleet
  Console, with its own key.
- **`remoteAccess.csr { name }`** makes a key on the machine (it never leaves) and answers `{ csr }` for that name.
- **`remoteAccess.on { name, port, certificate, until, allow }`** listens on `port` with the chain Cloud had issued,
  answers only connections from `allow` (each an IPv4 `/32` or IPv6 `/64`, at most 20), and stops by itself at
  `until`. Asked again while on, it replaces all of it. It is announced in hq to the organisation's admins and fleet
  admins, with `until` and `allow`.
- **`remoteAccess.off`** stops now; off is the starting state.
- **`remoteAccess.authenticator.add { id, secret, recoveryCodeHashes, claimBefore }`** — a TOTP secret (RFC 6238,
  SHA-1, 6 digits, 30 s) and the SHA-256 of 10 recovery codes, kept unclaimed until the first remote sign-in by an hq
  fleet admin who has no authenticator and gives a code from it, then bound to that account; dropped if unclaimed by
  `claimBefore`.
- Every remote session still needs a fleet admin's hq sign-in and the authenticator code.

### B10. A resize Cloud does

Cloud resizes the server itself. `resize.prepare` pauses runs and stops the machine's services cleanly;
`resize.finish` starts them and resumes runs once the controller says the resize is done. Until then runs stay
paused, across a restart of the host service.

### B11. The protocol as a versioned package

`@agenthix/core` is built and versioned as a package from this repository, so Cloud depends on one implementation of
the host protocol (and, in part C, the connection protocol) rather than a copy. Its version follows the platform's
tag. Publishing it runs from a tag, like the images; where it is published while the repository is private is set
in the same workflow and changed at the first release.

## Part C — an hq connects to Agenthix Cloud

### C1. The connection protocol, in `core`

A public contract, which hq implements and Cloud follows; it uses established standards rather than a scheme of its
own.

1. hq makes an Ed25519 key pair and keeps the private key with its other secrets.
2. An organisation admin starts *Connect to Agenthix Cloud* in the Fleet Console (where host management placed it).
   hq asks Cloud for a connection, sending its public key, and gets a **device code**, a short **user code** and the
   page to approve it on — the shape of the OAuth 2.0 Device Authorization Grant (RFC 8628).
3. The admin approves on Cloud, checking that the user code matches the one hq shows. hq polls until it is approved,
   refused or expired.
4. Once approved, hq gets **short-lived access tokens** by signing a JWT with its private key (RFC 7523,
   `private_key_jwt`). No long-lived secret is ever shipped in the code or sent to hq.
5. The connection is always made outward from hq. Disconnecting, from either side, revokes the key's registration.
   **An hq that Cloud runs is connected by Cloud, with no code** (owner,
   [ADR-0135](../../adr/adr-0135-cloud-connects-an-hq-it-runs-without-a-code.md)): the host service tells hq that Cloud
   runs its machine; Cloud's controller asks hq for its key (`organisation.key`), registers it for the organisation it
   runs hq for, then asks hq to connect (`organisation.connect`), and hq keeps the connection once its key signs for
   a token. The Fleet Console cannot disconnect it there, and still offers *Connect* should Cloud not have.

### C2. Signing in with an Agenthix account

- An option, **never the only way in**: OpenID Connect, authorization code with PKCE, hq as the client registered by
  the connection.
- A person links their hq account to their Agenthix account in Settings › Sign-in, after signing in to hq as
  themselves. After sign-in, hq keeps its own session, so people already in keep working if Cloud is down.
- **hq never learns which other organisations a person belongs to**: it asks for no claim that lists them.
- Disconnecting falls back to hq's own sign-in for those people, who are told first; a person with no hq password is
  sent a link to set one.

### C3. Telling members about planned downtime

The notice inside hq and the pausing of agents are host management's. What the connection adds is the optional email
the day before: hq asks Cloud, through the connection, to email its members about a scheduled change, and keeps no
email service of its own.

## Part D — what the platform shows of Cloud, and the pledge

**The rule:** members see what Cloud gives them (one account, switching between organisations, an organisation of
their own) and can ask for it. Fleet admins also get an offer where Cloud removes a limit they have hit. An hq that is
not connected never calls Cloud, and nothing is offered before Cloud can deliver it.

- **"Sign in with Agenthix Cloud"** always on hq's sign-in and invitation pages; working when connected, otherwise
  greyed out with its reason beneath. These pages are public, so they carry no link to Cloud.
- **A member can ask for it:** Settings › Sign-in shows the Agenthix account. Not connected: *Ask a fleet admin to turn
  it on*, once per person; the Fleet Console shows fleet admins how many asked.
- **An organisation switcher for every member**, at the top of hq's sidebar and in the Fleet Console's menu head,
  listing only this organisation. Not connected, it says other organisations need Agenthix Cloud and why; connected
  and linked, *Switch organisation…* opens the person's switcher on Cloud. It holds *Start your own organisation ↗*.
- **One standing place to find Cloud:** the Fleet Console's HQ page has a Cloud section in each state — not
  connected, waiting for an early-access place, connected, hq on Agenthix Cloud — with one Connect wording that never
  assumes the person is new. hq's Organisation › Infrastructure says where hq runs and links there. *Link a Cloud
  account* appears only once the organisation is connected.
- **Offers only where Cloud removes a limit, and only to fleet admins:** one dismissible line, gone for good once
  dismissed, on *no site available*, *backups kept on the machine*, and *domain and HTTPS*. None on upgrade notices;
  members never see one.
- **Setup mentions Cloud once:** Setup › Review, under *Where agents run*, one sentence, no action. The user guide gets
  an Agenthix Cloud page.
- **Links out** carry where to return to, what the person was doing and their entry point, and nothing about the
  organisation or the person. The Fleet Console picks the task up on return.
- **The Responsible AI Pledge card**, live from the first release, as the pledge's page is: a dismissible card last on
  Home, inviting the person to join the movement and saying why (owner's words, the board *pledge*): *The Responsible
  AI Pledge — an Agenthix initiative*; "More and more people are worried about how AI is being used. But AI isn't good
  or bad on its own: it's as good as the people who use it." "The pledge is a movement of people who commit to using
  it honestly, under their oversight, and owning what it does." Its state follows what hq knows (owner):
  - **No linked Agenthix account** (or hq not connected, or the person withdrew): "It's free to sign, and your badge
    shows the people you work with where you stand." *Join the movement ↗* to agenthix.com/responsible-ai. hq asks
    no one.
  - **Linked, not signed:** "You're already signed in to Agenthix Cloud, so joining takes one step, and your badge is
    ready to share." *Join the movement ↗* to signing on Cloud, and *What it asks ↗* to the website.
  - **Linked, signed the current version:** no card, so someone in several HQs is not asked again in each.
  - **Linked, signed an earlier version:** *The Responsible AI Pledge has a new version*, "Thank you for signing
    version N. Version M is out: see what changed, and sign it to keep your badge current.", once per new version,
    even to someone who dismissed the invitation.

  The dismissal is kept per person (and per version for the new-version card). For a linked person hq asks Cloud,
  through the connection, whether they signed (`core/src/cloud/pledge.ts`), keeps the answer an hour, and shows it to
  that person alone. **Settings › Sign-in** shows their own signature, *Signed version N*, with *Your badge ↗* to their
  page on Cloud. Showing a signer's seal to colleagues is a later feature. The README gets a short section and the
  guide a paragraph.

Every new screen and state is drawn on a board in `boards/` before it is built, light and dark, and built from hq's
and the Fleet Console's existing components.

## Part E — a client other than the browser

The mobile app talks to an organisation's hq through the same operations and Socket.IO connection as the web app.

- **A phone's session renews while it is used**: its expiry slides forward with use; a phone unused for 30 days signs
  in again. The same for a session made by signing in with a password on the phone.
- **A person sees and signs out their phones** in Settings › Devices and connections › Phone: which device, when last
  used, and *Sign out*.
- **A client can tell whether its connection is alive**: a small event hq acknowledges.
- **A signed-in client can read hq's version**, behind sign-in, keeping `/health` free of it
  ([ADR-0106](../../adr/adr-0106-each-service-keeps-its-own-logs.md) is unchanged).
- **What needs a person is pushed over the socket**: an event when notifications, *needs you* counts or runs change.
- **Not in this unit:** the phone page's wording, which follows the app's screens once they are settled; and handing
  notifications to Cloud for the official app, whose boundary — which events may leave an hq, the least data sent,
  revoking it — needs a design of its own first, and Cloud's delivery service.

## Security

- Every Cloud operation is refused unless the machine is enrolled with Cloud and the envelope comes from the pinned
  Cloud identity, fresh and never seen before.
- The enrolment code is spent on any failed join, valid for an hour at most, and its file is deleted once spent.
- Registry credentials, backup credentials, account links, certificates' private keys and authenticator secrets are
  never logged, kept only at `0600` in the state of the part that uses them (the host service's, or for remote
  access's key and authenticator secrets the Fleet Console's, where TLS ends and codes are checked), and never sent
  anywhere but where they are used.
- An hq never learns a person's other organisations, and never calls Cloud unless connected.
- **Registry credentials in the start-up settings are for staging machines only.** Start-up settings stay readable
  on the machine for its lifetime, so a credential there must reach nothing but images that will be public; it is
  revoked when the packages go public.

## Decision records

| | Records |
|---|---|
| **Written by this unit** | The `cloud` flag is removed, and each Cloud feature is gated by its own condition · On a machine Cloud runs, Cloud may turn remote access on (B9) · Account links for a controller, on Cloud's machines only (B7) · An hq connects to Cloud by device approval and signed tokens (C1) · A machine may pull images with registry credentials from its start-up settings (B1) |
| **Revisits** | ADR-0116 — the `cloud` flag goes; the rule stands · host management's spec, §7 — Cloud may turn remote access on, on its own machines only |
| **Depends on** | ADR-0114, ADR-0115, ADR-0117 |

## Out of scope

- Cloud's own side: its controller, dashboard, approval page and delivery of notifications.
- The phone page's wording, and notifications through Cloud (part E).
- Tagging, publishing and the first install from published images, which happen on the maintainers' say-so.
