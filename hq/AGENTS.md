# hq — the control plane

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `hq/`.

`hq` is the web application for managing AI agents, projects, sessions and skills, and the authoritative source
of truth for an organisation's data. It dispatches every run to an Execution Site over the control channel and
executes nothing itself; the agent runtime lives in `site/`. How the two fit together:
[`docs/architecture/README.md`](../docs/architecture/README.md).

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Wasp `0.25.0` | Full-stack TypeScript: React + Node.js + Prisma + PostgreSQL. The CLI is pinned in `package.json`: run it as `npx wasp` |
| Frontend | React `^19.2.1` + React Router 8 | Vite 8 |
| Backend | Node.js 24.14.1+ | Managed by Wasp |
| Database | PostgreSQL 14+ | Prisma; dev instance on port 4109 |
| Styling | Tailwind CSS v4 | `@import "tailwindcss"` syntax — no `tailwind.config.js` |
| Auth | Wasp username + password | Session token in browser storage, sent as `Authorization: Bearer` — no cookie |
| Real-time | Socket.io | Relays each site's streamed agent output into the browser's session room |
| Language | TypeScript 6.0 | Strict mode |

**Tailwind v4:** theme tokens live in `@agenthix/ui/theme/tokens.css` (the `ui/` module, in-tree via `file:`).
`src/Main.css` imports them after `@import "tailwindcss"` and has `@source "../../ui/src"` so Tailwind scans the
ui package for class names.

**Running Wasp:** after `npm install`, run `npx wasp <command>` from `hq/` (`npx wasp install` once on a fresh
clone, then `npx wasp start`, `npx wasp build`, `npx wasp db migrate-dev`). It runs the version pinned in
`package.json`; a global `wasp` of another version is not used. Set `WASP_TELEMETRY_DISABLE=1` to stop the CLI
sending usage telemetry; hq's images set it.

**Typecheck:** `npm run typecheck`. `tsconfig.json` only references `tsconfig.src.json` (the app, tests
included) and `tsconfig.wasp.json` (the `*.wasp.ts` declaration files), so a bare `npx tsc --noEmit` checks nothing and passes.
The client build (`npx vite build`, run by the image) type-checks `src/` too, tests included, so a type error in
a test fails the image build.

**Generated output:** `.wasp/` is generated — never edit files inside it. All source lives in `src/`,
`main.wasp.ts` and `schema.prisma`.

## How hq runs work

hq owns the task state machine — claiming, one run per agent and project at a time, and holding a task while
its site is down — and dispatches each chat message and task run to a site (`src/agents/dispatchService.ts`);
the terminal state comes back as status frames. It declares no Wasp `job`: one in-process scheduler
(`src/automation/`) ticks at the top of every minute and starts what a boundary's automation, start times and
routines have made due. A run is an `AgentRun` row in the site's database, which hq reads over the channel
(`src/sessions/siteRuntimeStore.ts`).

When hq approves a registering site, it tells the site to dial hq's own `WASP_SERVER_URL` (`HQ_URL` in
`compose.yml`), so that address must be reachable from every site's machine as well as from browsers.

## Where things are

```
hq/
├── main.wasp.ts       — the app's settings (auth, client, server, database) and the server-wide APIs;
│                        composes every feature's declarations
├── schema.prisma      — the database schema
├── src/
│   ├── <feature>/     — one folder per feature (ADR-0093), for example:
│   │   ├── <feature>.wasp.ts  — the feature's routes, pages, queries, actions and APIs
│   │   ├── operations, services and other server code, at the folder's root
│   │   ├── pages/             — the feature's routed pages
│   │   ├── components/        — components only this feature uses (when it has several)
│   │   ├── hooks/             — hooks only this feature uses (when it has several)
│   │   └── __tests__/         — tests, beside what they test
│   ├── agents/        — agent definitions and dispatch to a site — no runtime
│   ├── automation/    — the scheduler, a boundary's pulse, start times and routines
│   ├── projects/      — projects, boards and tasks
│   ├── sessions/      — session operations, and reads of runs and transcripts from the site
│   ├── sites/         — Execution Sites: registration, the control and content channels, credentials
│   ├── cloud/         — hq's connection to Agenthix Cloud: device approval, signed requests, signing in with an
│   │                    account, the downtime email (docs/architecture/cloud-connection.md)
│   ├── …              — the other features (auth, github, library, model-access, settings, storage, voice, …)
│   ├── server/        — code every feature uses on the server: setup, socket, middleware, the MCP server,
│   │                    the site-facing data API, roles and tokens, the dashboard notifier
│   ├── shared/        — code every feature uses in the client: app shell, layout, shared UI, client/server-safe
│   │                    utilities
│   └── test/          — the integration suite's database helpers
├── assets/            — platform assets (agent templates, avatars, the skills library)
└── migrations/        — Prisma migrations
```

## Wasp conventions

- A feature's routes, pages, actions, queries and APIs are declared in its own `src/<feature>/<feature>.wasp.ts`
  (a Wasp Spec file, `@wasp.sh/spec`), which exports a `<feature>Spec` array that `main.wasp.ts` lists in `spec`.
  Only the app settings and the server-wide APIs are declared in `main.wasp.ts`. Nothing is wired
  programmatically. Source is referenced with `import { x } from "./…" with { type: "ref" }`. An action or query
  must be declared, and Wasp regenerated, before its generated types exist.
- An operation or API's generated names come from the name it is imported under in its declaration file; keep
  the import alias when the function's own name differs.
- **Where new code goes:** in its feature's folder — a page in `pages/`, a component or hook only that feature
  uses in `components/` or `hooks/` (beside the pages once there are several), everything else at the folder's
  root. A feature may import from another feature. Code that is generic rather than any feature's goes in
  `src/shared/` (client) or `src/server/` (server).
- **A new query is also added to `src/server/readOnlyQueries.ts`.** While hq moves to a new machine it is read-only:
  it answers only the queries listed there and refuses every other operation, since Wasp serves queries and actions
  alike. `src/server/__tests__/readOnly.test.ts` compares the list with what Wasp generated and fails until they match.
- Use Wasp's generated types (`wasp/client/operations`, `wasp/server/operations`, …); do not redefine them.
- Never import server-only code from client files.
- Shared types that cross the client/server boundary go in `src/shared/`.

## Tests

[ADR-0094](../docs/adr/adr-0094-hq-operations-are-tested-against-the-real-database.md):

- **An operation or service that reads or writes data is tested against the real test database** — an
  `*.integration.test.ts` beside the code, using `src/test/db.ts` and `src/test/factories.ts`. Unit tests are for
  pure logic.
- **The five modules many tests need replaced have one shared fake each**, in `src/test/fakes/` (the dashboard
  notifier, the site read store, the task runner, the activity feed, dispatch). Wire it with
  `vi.mock('<module>', () => import('<path>/test/fakes/<module>'))`; never write a separate mock of them.
- **A test that only checks a mock was called is not kept** once a test that checks a result covers the same
  behaviour. Calls that leave hq — to a site, GitHub, a voice provider — may still be replaced.
- `npm test` runs the unit suite; `npm run test:integration` runs the integration suite, four files at a time, each
  worker on its own database (`agenthix_w1_test` … `_w4_test`, created and migrated by
  `scripts/test/with-test-db.mjs`; `TEST_DB_NAME` changes the prefix, `TEST_DB_WORKERS` the count). Each test starts
  from an empty database. Neither suite reads the dev-only settings in `.env.server`.

## UI work

hq owns all browser-facing UI — chat and session views included, even though the session drivers and transcripts are the site's. Before adding or changing any, read [`ui/DESIGN-SYSTEM.md`](../ui/DESIGN-SYSTEM.md)
— tokens, the component lift workflow, the inventory. Never hardcode a hex colour: use the token utilities
(`bg-accent`, `text-accent`, `border-accent/20`, …), or `var(--color-accent)` in inline styles.

For the app shell — sidebar, panels, nav rail, ChatPanel — use the `app-layout` skill in
[`.agents/skills/`](.agents/skills/app-layout/SKILL.md); it defines the layout's boundary rules.

## Running and migrating

Starting hq and its site, pairing, and reaching hq from another device: the `running-locally` skill
([`../.agents/skills/running-locally`](../.agents/skills/running-locally/SKILL.md)). Schema changes and
migrations: the `database-migrations` skill
([`../.agents/skills/database-migrations`](../.agents/skills/database-migrations/SKILL.md)).
