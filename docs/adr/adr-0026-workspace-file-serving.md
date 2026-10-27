---
created: 2026-03-30
description: Serving workspace files from HTTP endpoints on the site rather than integrating external storage.
---

# ADR-0026: Workspace File Serving via Site HTTP Endpoints

**Status:** Accepted
**Deciders:** the maintainers

## Context

Agents need a place to write documents — ideation notes, exploration outputs, design summaries. Humans need to view those documents from the HQ webapp and edit specific agent config files (responsibilities, memory, etc.) without touching the filesystem directly.

The solution must be self-contained, require no external storage service, and respect the existing data sovereignty principle: heavy data stays on the Site.

---

## Decision

> ⚠️ **The endpoints are on hq, not the Site** — `hq/src/server/fileServingHandlers.ts`.
> Nothing superseded this record; file serving moved side during the hq/site split and no
> record was written. **The decision stands** — files are served over HTTP endpoints rather
> than through an external storage service, with artifact URLs unguessable by UUID. Only
> the "two endpoints on the Site backend" placement is untrue. *(annotated 2026-08-19)*

> ⚠️ **The note above is wrong about authentication, and so is the body.**
> *(annotated 2026-09-26)* "Artifact URLs unguessable by UUID" is not how files are served: a file
> is served only to a signed-in user, and a URL is an address and never a credential. The two
> routes are limited to exactly who is entitled to the bytes — an artefact route (`GET
> /files/artefact/:ownerType/:ownerId/:uuid/*path`) that also applies the location access rule,
> and a task-attachment route (`GET /files/task/:taskId/:uuid/*path`) that requires membership of
> the task's project — and neither has a `PUT`, so a URL cannot be used to write. The bytes of an
> artefact are no longer read from the local disk by the endpoint that serves them: hq asks the
> Execution Site that holds the storage, over the control channel. **The config-editing endpoint
> and its site-key authentication no longer exist**; nothing edits an agent's files over HTTP, and
> the site key authenticates no file route. The `attachFile` tool is now `attach_file`, and it
> records a `TaskAttachment` row in hq's database rather than a task document, keeping the file
> under hq's own storage. What stands is the choice this record makes: files are served over
> HTTP by the platform itself, with no external storage service. [file-sharing.md](../concepts/file-sharing/file-sharing.md)
> describes the mechanism as it is; the convention reference linked below is now only a pointer to it.
>
> *(Annotated 2026-10-07.)* The artefact route is gone: an artefact is one file in its owner's `artefacts/` folder, listed and read through hq's own queries (`listArtefacts`, `getArtefactContent`) under the same location access rule, and opened in hq's file viewer. Only the task-attachment route remains.
>
> *(Annotated 2026-10-27.)* The task-attachment route is gone too: hq-server serves no file. Every file a browser opens, a task's attachment included, is carried by a relay on a ticket hq signs for one file and one person ([ADR-0153](adr-0153-relays-carry-every-file-byte-and-hq-only-signs-tickets.md); [files-and-relays.md](../architecture/files-and-relays.md)). What stands is still the choice this record makes: files are served by the platform itself, with no external storage service.

Expose two HTTP endpoints on the Site backend rather than integrating an external storage service.

**Artifact serving** is public but unguessable — security comes from a UUID in the path, the same model Google Photos and Supabase Storage use. The UUID is generated server-side by the MCP tool, never by the agent directly. The URL only surfaces via Firestore task attachments, which are access-controlled.

**Config editing** is authenticated via site key since it involves sensitive write operations on agent workspace files.

No external storage. No new services. The workspace filesystem already exists — we just serve it.

A new `attachFile` MCP tool owns the full file creation flow: it generates the UUID, writes the file, constructs the public URL, and records the attachment in the task doc. Agents never generate UUIDs or construct URLs directly.

---

## Consequences

### Positive

- No external dependencies — no S3, GCS, or third-party storage to provision, secure, or pay for.
- Files are co-located with agent execution — no network round-trips between Site and storage.
- The workspace filesystem doubles as an inspection surface for ops and debugging.
- Simple mental model: the URL is a stable pointer; editing it replaces the content at the same path.

### Negative / trade-offs

- Files are only accessible when the Site is running. This is acceptable because agents can't run when the Site is down anyway — the availability constraint is already present.
- No CDN, no geographic distribution. Fine for human-readable artifacts; not suitable for large binary assets.
- Files live on the Site's local filesystem — they are not replicated. If the Site host is lost without a backup, files are lost. Agents should treat `shared/` as an output surface, not a primary store.

---

## Alternatives Considered

**External object storage (S3/GCS)** — rejected. Adds an external dependency, credential management, and cost. The data sovereignty principle prefers data on the Site.

**General filesystem browser** — rejected. Exposing the full workspace filesystem creates an unbounded attack surface. The `shared/` boundary and config whitelist are intentional constraints.

**User upload system** — deferred. Users editing config files via the config editor is the immediate need. Arbitrary user uploads to agent workspaces are a separate concern for later.

---

## References

- [agent-file-serving.md](../concepts/workspace/agent-file-serving.md) — full convention reference (endpoints, security model, Firestore schema, MCP tool spec)
- [ADR-0017](./adr-0017-agent-execution-as-site-concern.md) — agent execution is a Site concern
- [ADR-0025](./adr-0025-agent-identity-as-first-class-org-member.md) — agent workspace model
