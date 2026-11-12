# File Sharing

File sharing in Agenthix covers how runs, tasks and the platform store files, who is allowed to read them back, and how they reach a person's browser. There are three buckets — artefacts, task attachments and identity images (the pictures and covers of agents, people, teams and the organisation). How any of them is opened, and how a file is named in a message, are in [opening-files.md](opening-files.md) and [references-and-chips.md](references-and-chips.md).

Where the bytes sit is the first thing to know about each bucket. **Artefacts live on the site that holds the storage boundary they were produced for.** Task attachments and identity images are hq's own storage. **No file byte passes through hq's server:** hq checks access and signs a short-lived ticket, and a relay carries the bytes, from the site or from hq's upload folder (see [opening-files.md](opening-files.md)). hq never reads or writes a site's disk: it derives no path under a site's root, and names a location by its owner and asks the site that holds it. So hq and a site need not share a filesystem, and nothing on this page assumes they do.

---

## Security model

Every query, every operation and every ticket hq signs requires a signed-in user, with one exception: the organisation's current picture and cover, given a link without a session only while an admin has chosen to show the whole cover on the sign-in page (see Bucket 3).

| Mechanism | How it works | Used for |
|---|---|---|
| **User session** | `Authorization: Bearer <sessionId>`, resolved by `resolveSessionUserId`; for a query or an operation, Wasp's own session. | Every request to hq |
| **Location access rule** | `assertLocationAccess` — your own personal storage, or a project you are a member of or may view (`hq/src/storage/locationAccess.ts`). | Files in a place, artefacts |
| **Project membership** | `requireProjectMember` against the task's project, decided when the ticket is signed (`hq/src/server/files/uploadAccess.ts`). | Task attachments |
| **Ticket** | A signed permission for one file at one version, one purpose and one person, valid five minutes, checked by the site or by hq's relay (`FILE_TICKET_TTL_SECONDS` in `core/src/relay/tokens.ts`). | Every byte a browser receives |

A machine-to-machine `X-Site-Key` header no longer serves any file route. The namespace it used to authenticate — an agent's `.private/` directory over `GET|PUT /agents/:agentId/config/*` — had no caller and has been removed.

**An address is stable, not its content.** hq exposes no way to write an artefact or an attachment, so an address, once handed out, keeps pointing at the same place. That is not the same as the file being immutable: a run whose effective tool set includes write tools gets its storage mounted read-write and can replace an artefact in place (the mode is chosen in `resolveContainerKey` in `site/src/agents/runtime/containerPrep.ts`, and applied as the mount's `:rw` or `:ro` suffix in `site/src/agents/runtime/containerRunArgs.ts`). Treat an address as a name, never as a guarantee about bytes and never as a credential.

**Public visibility is a future extension.** Each bucket could eventually support a `visibility: public | private` flag per file, so a public file could be shared with people outside the platform by capability URL. Nothing in the code implements this today — everything is private.

**Scoping is about ownership, not about which agent did the work.** Artefacts are addressed by the storage boundary they were produced for — a project or a person — and served to whoever that boundary already entitles. Task attachments are addressed by the task and served to that task's project members.

---

## Bucket 1 — Artefacts

The throwaway things an agent makes for people in a conversation — a draft, a table, a comparison. Each is one file directly in the owner's `artefacts/` folder, beside its `files/`, with no folder per conversation or per set:

```
{projects|users}/{ownerId}/artefacts/
  pricing-options.md
  launch-checklist.pdf
```

The path is built in one place, on the site that holds the storage: `getArtefactsDir` (`site/src/server/storage/paths.ts`). hq keeps no copy of it.

**Who writes:** the run itself, with its own file-write tooling, through its mount of the owner's storage. The prompt's description of `artefacts/` tells it to save each item as one file there and to link to it in its reply as `[title](artefacts/<file name>)` (`ARTEFACTS_DESCRIPTION` in `site/src/agents/runtime/locationResolver.ts`); hq's conversation view opens such a link in the Artefacts tool. There is no server-side writer and no MCP tool for it. A person keeps an artefact by asking an agent to move it into `files/`. Nothing records which conversation made an artefact.

**Listed by:** the `listArtefacts` query (`hq/src/storage/ownerFolderQueries.ts`), which applies the location access rule to the owner before anything else and asks the site for each file's name, size and modification time, newest first (`location.listArtefacts`). **Opened as any file is:** hq asks the site about the file (`file.about`), signs a ticket, and the relay carries the bytes ([opening-files.md](opening-files.md)).

### How the bytes get to the person

hq does not open the file. A site that holds the storage describes the file to hq (its size, when it changed and whether its first bytes look like text), hq chooses the kind and signs the ticket, and the person's browser fetches the bytes from the relay on the ticket. No request to a site carries a user id: the site holds no identity store, so hq applies the entitlement check before it asks, and the parameter shapes are `.strict()`, so a `userId` would be refused rather than ignored.

The site checks containment, and refuses every symbolic link: one at the file, even one pointing back inside, and an `artefacts/` folder that has itself been replaced by a link (`openInOwnerFolder` in `site/src/server/storage/locationContainment.ts`). A listing shows regular files only, so it never offers an entry its read would refuse. A site that is down answers 503, as every storage read does, and the frame says so.

---

## Bucket 2 — Task attachments

Files that belong to a task — deliverables, uploads, files an agent wrote for the task. Owned by the task, not by any agent. They live on **hq's own storage**, keyed by the task's immutable id:

```
<HQ_STORAGE_ROOT>/tasks/{taskId}/
  {uuid}/
    deliverable.md
```

The root is `HQ_STORAGE_ROOT` (`getHqStorageRoot` in `hq/src/server/hqStoragePaths.ts`) and the per-attachment directory is built by `getTaskAttachmentDir`. Each upload keeps its own directory beneath the task, so two uploads of the same filename do not collide.

**Opened by:** a link on hq's relay. hq makes the link on `GET /file-link?path=<upload path>` (`registerUploadLinkRoute`, `hq/src/server/files/uploadLinks.ts`): it checks access, signs a ticket for this person and this file at the version on disk, records it, and answers with the relay's link; hq-server never sends the file. hq's relay reads it from hq's storage folder, mounted read-only.
**Auth:** user session **and** membership of the task's project, decided when the ticket is signed (`hq/src/server/files/uploadAccess.ts`)
**Who writes:** a person, through the `uploadTaskAttachment` action (`hq/src/projects/actions.ts`, up to 10 MB); or an agent, through the `attach_file` tool, whose control-plane operation mints the uuid, writes the file and records a `TaskAttachment` row (`attachFileOp` in `hq/src/server/controlplane/taskOps.ts`)
**Mutable:** no. An update is a new uuid and a new row.

An attachment opens in the file viewer over its task, in the same frame as any file, and an agent names one as `attachments/<task key>/<file>` ([references-and-chips.md](references-and-chips.md)).

The same entitlement applies to every side of the bucket, not only to the bytes: uploading checks project membership (`uploadTaskAttachment`) and so does listing the attachments (`getTaskAttachments` in `hq/src/projects/queries.ts`), because the listing carries the uuid that is half the upload path.

**The content type is guessed from the file's name, never from its bytes, and every answer from a relay is fenced in.** Each answer carries `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store`, and cross-origin reading is allowed for hq's address only, without credentials (`setCommonHeaders` in `relay/src/http/responseHeaders.ts`). A person may upload any file at all, so an uploaded `.html` must never become a script on hq's own origin: a relay answers on the files address, another origin with no hq session, and on an installation with no files address it never serves a preview inline.

---

## Bucket 3 — Identity images

Pictures and covers for an agent, a person, a team and the organisation. They are hq's own data — nothing a run reads — so they live in hq's storage and serving one does not depend on a site being reachable:

```
<HQ_STORAGE_ROOT>/agents/{agentId}/images/{uuid}.{jpg|jpeg|png|webp}
<HQ_STORAGE_ROOT>/people/{userId}/images/{uuid}.{ext}
<HQ_STORAGE_ROOT>/teams/{teamId}/images/{uuid}.{ext}
<HQ_STORAGE_ROOT>/org/images/{uuid}.{ext}
```

Each is keyed by the owner's immutable id, so a rename moves nothing (`getAgentImagesDir`, `getPersonImagesDir` in `hq/src/server/hqStoragePaths.ts`).

**Opened by:** a link on hq's relay, made as an attachment's is (`GET /file-link?path=<upload path>`); the paths are matched in `core/src/files/uploadPaths.ts`
**Auth:** a signed-in session, and nothing more — a picture is org-wide content belonging to no project or task, so there is no membership rule to apply. The one exception is the organisation's own: its *current* picture and cover get a link with no session while `Org.signInShows` is the whole cover, so the sign-in page can show them; any older file still needs a session.
**Who writes:** a person, through the image picker or an upload (an admin for the organisation and a team), or hq drawing one from a stored recipe (a generated picture is written as an ordinary file, with a small copy beside it)

---

## Where each kind of file is served

| What | Auth | Bucket | Bytes come from |
|---|---|---|---|
| `GET /file-link?path=…` (an attachment or a picture) | User session, and project membership for an attachment | Task attachments, identity images | hq's upload folder, through hq's relay |
| A file in a place, or an artefact, opened by the Files tool, a task or a chip | The location access rule, checked when hq signs the ticket | Files, artefacts | The site, through its relay |

hq-server serves no file bytes of its own. A site's files and hq's uploads both reach the browser as a ticket's link on a relay, and none of them is mutable through a route of its own.

---

## Workforce template applications

A workforce template application is **not a file**. When the kernel proposes a template, the proposal is a task on the Workforce Assembly board and the selections live in the `applicationData` JSON column on that task's row (the `applicationData` field on the task model in `hq/schema.prisma`, written by `proposeWorkforceTemplateOp` in `hq/src/server/controlplane/workforceOps.ts`).

The review page saves in-progress selections to `applicationData.draftSelections` and the confirmed set to `applicationData.confirmedSelections` (`saveWorkforceDraft` and `confirmWorkforceTemplate` in `hq/src/library/actions.ts`), and reads them back through `getWorkforceReviewTask` (`hq/src/library/queries.ts`).

---

## Related

- [opening-files.md](opening-files.md) — tickets, relays, renderers and the frame
- [references-and-chips.md](references-and-chips.md) — how a file, folder, task or attachment is named in text, chips and embeds
- [workspace.md](../workspace/workspace.md) — Storage and Workspaces: the current storage layout, where each owner's `files/` and `artefacts/` sit
- [workforce-templates.md](../workforce/workforce-templates.md) — workforce template review flow
