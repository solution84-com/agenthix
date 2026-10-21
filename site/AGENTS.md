# site — the Execution Site

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `site/`.

An Execution Site runs agent containers and holds workspace storage. It is where the execution runtime lives:
the agent engine and container manager (`src/agents/runtime/`), the session drivers, workspace storage, the MCP
server and git-credential endpoint (`src/server/mcp/`, served locally and forwarding to hq for anything needing
control-plane authority), the outbound link to hq (`src/server/hq/`), registration (`src/server/registration/`),
and local verification of hq-issued tokens (`src/server/identity/`). How it fits with hq:
[`docs/architecture/README.md`](../docs/architecture/README.md).

## What the site owns, and what it does not

- **The runtime data.** `AgentRun`, `TranscriptEntry` and `ToolCallLog` live in the site's database and nowhere
  else. `AgentSession` exists on both sides with one writer per field: hq writes the creation fields once, and
  every runtime field (title, status, token totals) changes only on the site and replicates back.
- **No identity store** (ADR-0042). No `User`/`Session`/`Auth` tables; it authenticates no person. It verifies
  hq-issued tokens, pinning its own `siteId` as the audience so a token minted for a sibling site is refused.
- **No operator page** (ADR-0065). Browsers only ever talk to hq. The site's one port serves its agents'
  endpoints and `/health`; `/` answers 404. Status and leaving hq are done with `agenthix-site` on the machine.
- **hq dispatches; the site executes** (ADR-0050). Every chat message and task run arrives over the control
  channel; status and streamed output go back the same way. Reads of runs and transcripts are served from the
  site's database, failing with an explicit site-unreachable error rather than degrading to empty.

## A plain Node server, not a Wasp app

[ADR-0086](../docs/adr/adr-0086-the-execution-site-is-a-plain-node-server.md): Express 5 and Prisma, used directly.
There is no `main.wasp.ts`, no `.wasp/` and no `wasp` command here; running one is an error. Nothing here imports
`wasp/*`, and nothing imports from `hq/` — shared types go through `@agenthix/core`.

- `src/server/main.ts` is the entry: it builds the app, runs the site's boot (`src/server/setup.ts`), listens on
  `PORT` (4201), and shuts down cleanly on `SIGTERM`/`SIGINT` (`src/server/shutdown.ts`).
- `src/server/app.ts` is the route table. **A new endpoint is a row there**, its handler typed `ApiHandler`
  (`src/server/http/apiHandler.ts`) with its own authentication. The JSON and form parsers are mounted per route,
  never with `app.use`: the model relay must receive its body unread, because it streams it to the provider.
- The Prisma client is `import { prisma } from '#db'` (`src/server/db.ts`); tests mock it with
  `vi.mock('#db', …)`.
- `npm run dev` runs from source under tsx; `npm run build` bundles to `dist/server.js` with esbuild; `npm start`
  runs the bundle; `npm run typecheck` is `tsc --noEmit` and needs nothing generated first.
- The image (`docker/Dockerfile`) is built natively on every architecture and starts with
  `prisma migrate deploy`, then `node dist/server.js`.

## Registration and the control channel

A site has no command that asks to join an hq: it takes part when its host service starts it for the Fleet Console
(a fleet admin added it there; hq keeps only the hash of the credential the host service gave it, ADR-0115), or, as hq's
own site, by pairing at every start from `HQ_URL` and `HQ_PAIRING_SECRET` (ADR-0070); on hq's machine the host service
gives it hq-web by container name on the private Docker network the two share, the one plain `http://` name pairing
accepts. The credential is kept in `HqConnection.connectionToken`, which the transport sends as its bearer. The
`agenthix-site` command has `status` and `unregister`, and reaches the running site over a Unix socket:
`<SITE_ROOT>/run/control.sock` in development, and `/run/agenthix-site/control.sock` (`SITE_CONTROL_SOCKET`) in the
image. Deployed, the site publishes no port:
agents reach it over a private network per storage boundary (ADR-0066). The site dials hq, reconnects with
backoff, and on reconnect hq reconciles task state and drains any task held while the site was down.

## Running and migrating

Starting the site with hq: the `running-locally` skill
([`../.agents/skills/running-locally`](../.agents/skills/running-locally/SKILL.md)). Schema changes and
migrations: the `database-migrations` skill
([`../.agents/skills/database-migrations`](../.agents/skills/database-migrations/SKILL.md)).
