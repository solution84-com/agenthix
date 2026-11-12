# Agent File Serving & Config Editing

> **Superseded (2026-09-26).** This document described a file-serving design that no longer exists: a public, unauthenticated artifact route whose URL was the credential, an authenticated route that let the webapp edit an agent's private config files, public agent images, and a `.public/` directory recorded in Firestore. None of those is in the code. The current mechanism is documented in [file-sharing.md](../file-sharing/file-sharing.md) — read that instead. The record that first chose to serve files over HTTP, [ADR-0026](../../adr/adr-0026-workspace-file-serving.md), carries a dated note on what has since changed.

This page is kept only so that older links resolve. What became of each part of the old design:

| Old design | Now |
|---|---|
| A public artifact route, `GET`/`PUT /files/{agentId}/{uuid}/{path}`, where possession of an unguessable URL was the credential | Gone. A task attachment is served by `GET /files/task/:taskId/:uuid/*path`, which requires a signed-in member of the task's project; an artefact has no route and is read through hq's storage queries, under the location access rule (your own personal storage, or a project you are a member of). Neither can be written through hq. A URL is an address, not a credential. |
| Artifacts written into an agent's `.public/` directory, with a URL recorded in Firestore | No `.public/` directory exists in the code, and Firestore is not used. A run's throwaway output goes in the `artefacts/` folder of the storage boundary it was working for, one file each, held by the Execution Site and read by hq over the channel to it. A file attached to a task is stored on hq, keyed by the task's id, and recorded as a `TaskAttachment` row. |
| The `attachFile` MCP tool, which generated a UUID and wrote the file under `.public/` | The `attach_file` control-plane tool (hq: `hq/src/server/controlplane/taskOps.ts`), which checks the caller's membership of the task's project, then writes the file under hq's storage and records the attachment row. |
| A config editor, `GET`/`PUT /agents/{agentId}/config/{path}`, authenticated by the site key, over an allow-list of an agent's `.private/` files | Removed. It had no caller, and neither the `hq/` nor `site/` sources register any `/config/` route. An agent's memory is held by hq and changed through the `remember` and `forget` tools and the memory screens, not by editing files. The `X-Site-Key` header no longer serves any file route. |
| Public agent images, `GET /agents/{agentId}/images/{name}`, probing `.jpg`, `.png` and `.webp` | Now `GET /agents/:agentId/images/:filename`, which requires a signed-in user and takes the exact stored filename (a generated name ending `.jpg`, `.jpeg`, `.png` or `.webp`), read from hq's own storage. |
| Platform presets served from `kernel/presets/`, seeded at startup | Gone. Avatars and covers are drawn by hq from a stored recipe and kept as ordinary files in hq's storage, served as an agent's images are. No preset route remains. |

For the storage layout and where each kind of file lives, see [workspace.md](./workspace.md).
