---
name: Domain map — relay
description: Feature-domain carving of the relay module (hq's relay server) for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Written 2026-11-03 from the module's folders and its AGENTS.md. Update only when its routes or frames change.
updated: 2026-11-03
---

# Domain map — `relay/`

3 domains. The relay is a small plain Node server (`node:http` and `ws`) of about 40 source files: sites dial in and hold a line, browsers fetch a file by ticket, and the relay passes bytes between them. It decides nothing about who may read what, holds no database and stores no file. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Lines, hq link & start-up | Site line, hq link, key set | configuration, start-up, the passes a site dials with, one line per site, the dial to hq and its welcome, load reports, hq's public keys, Git bundle carrying |
| 2 | File door, uploads & PDF viewer | Ticket, stream, upload, viewer page | a browser's `GET`/`HEAD /t/<ticket>`, answer headers, stream counts, hq's own uploads, the PDF viewer page and its browser code |
| 3 | Live apps | App entry, app cookie, preview host | names under the preview pattern, the entry ticket and cookie, the rules from fetch metadata, per-request and WebSocket streams, revocation, refusal counts |

---

## Domain scopes (files + operations)

### 1. Lines, hq link & start-up
- **Files:** `src/main.ts`; `src/relay.ts`; `src/config.ts`; `src/load.ts`; `src/log.ts`; `src/filesHost.ts`; `src/keySet.ts`; `src/lines/lineServer.ts`; `src/lines/siteLines.ts`; `src/hq/hqLink.ts`; `src/hq/revokeFrame.ts`; `src/bundles/carryBundle.ts`; `package.json`; `package-lock.json`; `tsconfig.json`; `vitest.config.ts`; `scripts/build.mjs`; `docker/Dockerfile`; `.gitignore`
- **Ops:** the site line on `RELAY_SITE_LINE_PATH` (a pass signed RS256, audience this relay, subject the dialling site; a new dial replaces the old line once its streams finish); the dial to hq's `RELAY_HQ_LINK_PATH` with the shared secret; hq's `relay.welcome`; the load report every `RELAY_REPORT_INTERVAL_MS`; the `relay.revoke` frame's reading; the `relay.bundle` order and `relay.bundleReport` (`bundle.read` on the source, `bundle.write` on the destination); hq's keys from `HQ_JWKS_PATH`; GET `/health`
- **Note:** security-sensitive: the shared secret (never logged), the line's pass check, the hq address rule (https, or plain http only to this machine, a private address or a container name), and what the log may never hold (a ticket, a path, a query string, a request header). The environment table in `AGENTS.md` is this domain's contract.

### 2. File door, uploads & PDF viewer
- **Files:** `src/http/door.ts`; `src/http/ticketRequest.ts`; `src/http/serveStream.ts`; `src/http/responseHeaders.ts`; `src/uploads/serveUpload.ts`; `src/uploads/uploadFolder.ts`; `src/viewer/viewerAssets.ts`; `src/viewer/viewerPolicy.ts`; `src/viewer/viewerRoute.ts`; `viewer/pdf/address.ts`; `viewer/pdf/documentOptions.ts`; `viewer/pdf/layout.ts`; `viewer/pdf/main.ts`; `viewer/pdf/messages.ts`; `viewer/pdf/ticketSource.ts`; `viewer/pdf/toolbar.ts`; `viewer/pdf/viewer.css`; `viewer/tsconfig.json`
- **Ops:** GET/HEAD `/t/<ticket>` on the files host and `/relay/t/<ticket>` on the app's host; `files.serve` on a site's line with the ticket and the raw `Range`; an upload's ticket served from `HQ_UPLOADS_ROOT` (503 when it is not mounted); GET/HEAD `/viewer/pdf` and `/viewer/pdf/*` (files host only, only when hq's origin is known); the viewer's `postMessage` to and from hq's page (`pdf-viewer-host`)
- **Note:** security-sensitive: cookies and authorisation dropped, the per-person stream limit (16, then 429), the answer headers (`Content-Security-Policy: sandbox`, `nosniff`, `no-referrer`, CORS for hq's origin only), the answer form for the bare door, and the upload open rules (`O_NOFOLLOW`, exact real path, no extra hard link, version checked against the open file). The viewer reads its file by range from a ticket path in the address fragment and takes a renewed ticket only from its parent, from hq's origin.

### 3. Live apps
- **Files:** `src/apps/appAnswers.ts`; `src/apps/appDeps.ts`; `src/apps/appDoor.ts`; `src/apps/appEntry.ts`; `src/apps/appHttp.ts`; `src/apps/appJar.ts`; `src/apps/appRefusals.ts`; `src/apps/appRules.ts`; `src/apps/appSocket.ts`; `src/apps/previewHost.ts`; `src/http/previewCheck.ts`
- **Ops:** every request to a name under `PREVIEW_PATTERN`, answered before the files door drops cookies; the entry `POST` from hq's page (app ticket verified, taken once, `__Host-` cookie set); each request and WebSocket as its own `app.serve` stream; `relay.ask` to hq before every new stream; `relay.revoke` ending what it covers; refusal counts reported to hq; `p-check` for the Fleet Console's check
- **Note:** security-sensitive and behind the `livePreview` flag at its experimental stage. The cookie handle is random and kept in memory only; a no from hq, or no answer, forgets the cookie; no fetch metadata fails closed.

---

## Excluded from all domains

- Tests and test support: `*.test.ts`, `src/__tests__/` and `src/test/` (`appBrowser.ts`, `appSite.ts`, `fakeSite.ts`, `harness.ts`, `signer.ts`, `uploadsOnDisk.ts`).
- `node_modules/`, `dist/`, `.agents/`.
- `AGENTS.md` and `CLAUDE.md`.
- `.env.server`: a local, untracked, git-ignored environment file; not source, and its values are not read by the audit.
