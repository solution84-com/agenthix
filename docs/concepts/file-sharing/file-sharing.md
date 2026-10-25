# File Sharing

File sharing in Agenthix covers how runs, tasks and the platform store and exchange files, and who is allowed to read them back. There are three buckets — artefacts, task attachments and identity images (the pictures and covers of agents, people, teams and the organisation) — plus the platform's read-only preset images. Artefacts are read through hq's storage queries; the other two are served on routes of their own.

Where the bytes sit is the first thing to know about each bucket. **Artefacts live on the site that holds the storage boundary they were produced for, and hq reads their bytes from that site over the content transport** (see [control-channel.md](../../architecture/control-channel.md)). Everything else on this page is hq's own storage, which hq reads directly. hq never reads or writes a site's disk: it derives no path under a site's root, and names a location by its owner and asks the site that holds it. So hq and a site need not share a filesystem, and nothing on this page assumes they do.

---

## Security model

Every served route and every query requires a signed-in user, with two exceptions: the platform preset images, which are read-only content shipped in hq's image, and the organisation's current picture and cover, served without a session only while an admin has chosen to show the whole cover on the sign-in page (see Bucket 3).

| Mechanism | How it works | Used for |
|---|---|---|
| **User session** | `Authorization: Bearer <sessionId>`, resolved by `resolveSessionUserId` (`hq/src/server/fileServingHandlers.ts`); for a query, Wasp's own session. | Every bucket |
| **Location access rule** | `assertLocationAccess` — your own personal storage, or a project you are a member of (`hq/src/storage/locationAccess.ts`). | Artefacts |
| **Project membership** | `requireProjectMember` against the task's project. | Task attachments |

A machine-to-machine `X-Site-Key` header no longer serves any file route. The namespace it used to authenticate — an agent's `.private/` directory over `GET|PUT /agents/:agentId/config/*` — had no caller and has been removed (a comment at the top of `hq/src/server/fileServingHandlers.ts` records it).

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

**Read by:** the `listArtefacts` and `getArtefactContent` queries (`hq/src/storage/ownerFolderQueries.ts`), which apply the location access rule to the owner before anything else. There is no file route for an artefact.

### How the bytes get to hq

hq does not open the file. It asks the site that holds that boundary's storage: `location.listArtefacts` on the control channel for the listing (each file's name, size and modification time, newest first), and `location.readArtefact` on the content transport for one file's bytes (`LOCATION_FILE_METHODS` in `core/src/protocol/locationFiles.ts`; hq's callers in `hq/src/storage/ownerFolderStore.ts`; the site's handlers in `site/src/server/storage/ownerFolderMethods.ts` and `site/src/server/hq/content/locationReadHandler.ts`). A read names the artefact by its file name — never a path — and the most bytes hq will take; the site refuses a larger file before sending any of it, and hq shows it as too large to preview. No request carries a user id: the site holds no identity store, so hq applies the entitlement check before it asks, and the parameter shapes are `.strict()`, so a `userId` would be refused rather than ignored.

The site checks containment, and refuses every symbolic link: one at the file, even one pointing back inside, and an `artefacts/` folder that has itself been replaced by a link (`openInOwnerFolder` in `site/src/server/storage/locationContainment.ts`). A listing shows regular files only, so it never offers an entry its read would refuse. A site that is down answers 503, as every storage read does. The bytes reach the person through the same file viewer as any file in `files/`, classified by `classifyFileContent` (`hq/src/storage/fileContentService.ts`).

---

## Bucket 2 — Task attachments

Files that belong to a task — deliverables, uploads, files an agent wrote for the task. Owned by the task, not by any agent. They live on **hq's own storage**, keyed by the task's immutable id:

```
<HQ_STORAGE_ROOT>/tasks/{taskId}/
  {uuid}/
    deliverable.md
```

The root is `HQ_STORAGE_ROOT` (`getHqStorageRoot` in `hq/src/server/hqStoragePaths.ts`) and the per-attachment directory is built by `getTaskAttachmentDir`. Each upload keeps its own directory beneath the task, so two uploads of the same filename do not collide.

**Served by:** `GET /files/task/:taskId/:uuid/*path` (registered in `hq/src/server/setup.ts`, handled by `getTaskFile`)
**Auth:** user session **and** membership of the task's project, decided before anything touches the filesystem (`getTaskFile`)
**Who writes:** a person, through the `uploadTaskAttachment` action (`hq/src/projects/actions.ts`, capped at 10 MB); or an agent, through the `attach_file` tool, whose control-plane operation mints the uuid, writes the file and records a `TaskAttachment` row (`attachFileOp` in `hq/src/server/controlplane/taskOps.ts`)
**Mutable:** no PUT. An update is a new uuid and a new row.

The same entitlement applies to every side of the bucket, not only to the bytes: uploading checks project membership (`uploadTaskAttachment`) and so does listing the attachments (`getTaskAttachments` in `hq/src/projects/queries.ts`), because the listing carries the uuid that is half the serving address.

**The content type comes from the file's extension, never from its bytes.** A small map of types that are either inert or rendered by the browser as data is served inline; anything else is `application/octet-stream` as an attachment, with `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` (`ATTACHMENT_CONTENT_TYPES` and `attachmentContentType` in `hq/src/server/fileServingHandlers.ts`, applied by `getTaskFile`). A person may upload any file at all, and an unmapped one served inline as text is how an uploaded `.html` becomes a script on hq's own origin.

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

**Served by:** `GET /agents/:agentId/images/:filename`, `GET /people/:userId/images/:filename`, `GET /teams/:teamId/images/:filename` and `GET /org/images/:filename` (registered in `hq/src/server/setup.ts`; handlers in `hq/src/server/imageHandlers.ts` and `hq/src/org/identityImages.ts`)
**Auth:** a signed-in session, and nothing more — a picture is org-wide content belonging to no project or task, so there is no membership rule to apply. The one exception is the organisation's own: its *current* picture and cover are served with no session while `Org.signInShows` is the whole cover, so the sign-in page can show them; any older file still needs a session.
**Who writes:** a person, through the image picker or an upload (an admin for the organisation and a team), or the platform copying a preset

---

## Platform presets

The avatar and cover images the picker offers. Read-only content shipped in hq's image and read straight from its assets directory — not storage, and not anybody's data (`hq/src/server/presetHandlers.ts`).

**Served by:** `GET /presets/:type` and `GET /presets/:type/:filename` (registered in `hq/src/server/setup.ts`; `listPresets` and `servePreset`)
**Auth:** none

---

## Endpoint summary

| Endpoint | Auth | Bucket | Bytes come from |
|---|---|---|---|
| `GET /files/task/:taskId/:uuid/*path` | User session **and** project membership | Task attachments | hq's own storage |
| `GET /agents/:id/images/:filename`, `/people/:id/images/:filename`, `/teams/:id/images/:filename` | User session | Identity images | hq's own storage |
| `GET /org/images/:filename` | User session; none for the organisation's current picture and cover while the sign-in page shows the whole cover | Identity images | hq's own storage |
| `GET /presets/:type` | None | Platform presets | hq's bundled assets |
| `GET /presets/:type/:filename` | None | Platform presets | hq's bundled assets |

None of these is mutable through a PUT on its own route. Artefacts have no route: they are read through the `listArtefacts` and `getArtefactContent` queries, from the site holding that boundary's storage.

---

## Workforce template applications

A workforce template application is **not a file**. When the kernel proposes a template, the proposal is a task on the Workforce Assembly board and the selections live in the `applicationData` JSON column on that task's row (the `applicationData` field on the task model in `hq/schema.prisma`, written by `proposeWorkforceTemplateOp` in `hq/src/server/controlplane/workforceOps.ts`).

The review page saves in-progress selections to `applicationData.draftSelections` and the confirmed set to `applicationData.confirmedSelections` (`saveWorkforceDraft` and `confirmWorkforceTemplate` in `hq/src/library/actions.ts`), and reads them back through `getWorkforceReviewTask` (`hq/src/library/queries.ts`).

---

## Related

- [workspace.md](../workspace/workspace.md) — Storage and Workspaces: the current storage layout, where each owner's `files/` and `artefacts/` sit
- [workforce-templates.md](../workforce/workforce-templates.md) — workforce template review flow
