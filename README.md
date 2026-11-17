# Agenthix

The source-available Agenthix platform — AI agent management, task execution, and collaboration.

<p align="center">
  <a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/home.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/home.png" alt="Agenthix home: the greeting, what needs you, what is running and what to say first" width="720"></a>
</p>

## What you can do

Each picture opens at full size, and each title opens its page in the [user guide](docs/guide/index.md).

<table>
<tr>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/home.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/home.png" alt="Home, with a conversation box and the work in progress" width="380"></a>

**[Start from a conversation](docs/guide/getting-started/first-conversation.md)**<br>Ask an agent for something in plain words, and watch it work.

</td>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/project-board.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/project-board.png" alt="A project board with tasks in each column" width="380"></a>

**[Run work on a board](docs/guide/projects/boards.md)**<br>Keep a project's tasks on a board and hand them to agents.

</td>
</tr>
<tr>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/library.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/library.png" alt="The Library, with the ready-made agents, teams and task templates" width="380"></a>

**[Build a team of agents](docs/guide/agents/library.md)**<br>Give each agent its role, instructions and permissions.

</td>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/knowledge-page.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/knowledge-page.png" alt="A Knowledge page in a project" width="380"></a>

**[Keep what you know in Knowledge](docs/guide/projects/knowledge.md)**<br>Write pages in sections that people and agents can read.

</td>
</tr>
<tr>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/live-preview.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/live-preview.png" alt="A live preview of an app an agent built" width="380"></a>

**[Try what an agent built](docs/guide/projects/live-previews.md)**<br>Open a running app beside the conversation, before you accept the work.

</td>
<td width="50%" valign="top">

<a href="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/chat-conversation.png"><img src="https://github.com/solution84-com/agenthix/releases/download/v0.1.0/chat-conversation.png" alt="A conversation with Kernel, open beside the Chat page" width="380"></a>

**[Talk to your agents](docs/guide/your-tools/phone-and-voice.md)**<br>Speak to an agent in any conversation, and hear it answer.

</td>
</tr>
</table>

## Modules

| Module | Purpose | Stack |
|--------|---------|-------|
| `hq/` | Control plane — the web application. Org data, projects, tasks, sessions, agents, and the entire user-facing UI. | Wasp + React + PostgreSQL |
| `site/` | Execution Site — runs agent containers and holds workspace storage. Serves no web page. | Node.js + Express + Prisma + PostgreSQL |
| `core/` | Shared TypeScript types and protocol definitions. | TypeScript |
| `ui/` | Shared web React component library (`@agenthix/ui`). | React + Tailwind v4 |
| `host/` | The host service and its CLI (`agenthix install`, `status`, `hq invite-admin`, `hq reset-password`…), run as a container on every machine. | Node.js |
| `console/` | The Fleet Console's server — the fleet admins' portal. It dials out to hq and signs every command to a host service. | Node.js |
| `console-web/` | The Fleet Console's screens, built into static files that `console/` serves. | React + Vite + Tailwind v4 |
| `relay/` | The relay — carries the bytes of files and live apps from a site to the browser. | Node.js |
| `front-door/` | An optional HTTPS front door for a machine that has none. | Caddy |
| `tests/cross-app/` | The cross-app suite — hq and a site booted and tested together. | Vitest |

All are plain directories in this one repository — **not submodules**.

### HQ and Site

An org's **HQ** is the single source of truth for its data — one per org, self-hostable. **Execution Sites** are the execution layer only and hold no independent identity store; an org can register more than one, and HQ and a site can run on separate machines.

The execution layer — agent runtime, session drivers, workspace storage — lives in `site/`: hq dispatches every run to a site and executes nothing itself. See [`docs/architecture/`](docs/architecture/README.md) for how it is built, and `AGENTS.md` for working in this repository.

## Local development

You need Node.js 24.22.3 or later (`.nvmrc` names that exact version, so CI and the Dockerfiles stay on it, and a Node bump is a change to that file and the Dockerfiles together) and Docker.

```bash
docker compose up -d          # dev databases: hq on 4109, site on 4209

hq/scripts/install.sh         # first time only, after core's build and ui's install (CONTRIBUTING.md)
cd hq   && npx wasp start     # client 4100, server 4101
cd site && npm run dev        # server 4201
```

hq pins its Wasp CLI as a dev dependency, so run Wasp as `npx wasp` from `hq/`; no global install is needed.

In VS Code, **Run Task → `[dev] Start All`** does all of the above, each app in its own terminal.

Copy the env templates before the first run:

- `hq/.env.server.example` → `hq/.env.server`
- `hq/.env.client.example` → `hq/.env.client`
- `site/.env.server.example` → `site/.env.server`

`hq/scripts/dev/start.sh` is an alternative launcher that also checks the agent container image and handles LAN-exposure flags for device testing.

## Deployment

Only Docker is needed. On a machine, start the host service, the one authority over that machine, then ask it to install; [`host/AGENTS.md`](host/AGENTS.md) has the `docker run` that starts it, and `docker exec -it agenthix-host agenthix install` installs HQ and its site.

A further site, on another machine, joins through the Fleet Console: it shows a one-time code to give to that machine's admin, who starts the host service there and runs one command with HQ's address and the code ([Add, move or remove a site](docs/guide/running-agenthix/add-a-site.md)). An optional HTTPS front door for a machine that has none is in `front-door/`.

`hq/compose.yml` and `site/compose.yml` build the images from a clone, for developing the images. They are not a way to deploy: the signed images, protections, backups and the Fleet Console come only with the host service.

**Read [the deployment guide](docs/architecture/deployment.md) first** — the settings, what to put in front of hq, and adding a site.

## Versioning

| Module | Strategy | Reason |
|--------|----------|--------|
| Every module | No version in the source — every `package.json` and lock file stays at `0.0.0` | The version is a name given when a release is published, never built in |

A release is a git tag at the repo root (`v<version>`, for example `v0.1.0`) on a commit that has been proved. The tag publishes signed images for `hq/`, `site/`, `host/`, `console/` and `relay/`, which the host service installs; nothing is built from the checked-out commit on a machine. See [`docs/architecture/versioning.md`](docs/architecture/versioning.md).

### `core/` is referenced by file path

`hq/` and `site/` both depend on `"@agenthix/core": "file:../core"` (and likewise `@agenthix/ui`). This works inside the repo but breaks if a module is cloned standalone.

**Before either app is usable outside this repo:** publish `core/` and `ui/` to npm or GitHub Packages and switch the references to real versions.

## The Responsible AI Pledge

The Responsible AI Pledge is an Agenthix initiative. AI isn't good or bad on its own: it's as good as the people who use
it. The pledge is a movement of people who commit to using it honestly, under their oversight, and owning what it does.
It is separate from this software, and free to sign.

**[Read and sign the pledge at agenthix.com/responsible-ai](https://agenthix.com/responsible-ai)**

## Docs

| Folder | Contents |
|--------|----------|
| `docs/architecture/` | System architecture — stack, conventions, constraints |
| `docs/concepts/` | Domain model — agents, tasks, projects, workspaces, skills |
| `docs/adr/` | Architecture decision records for this repo |
| `docs/qa/` | QA contract — scenarios, stories, domain maps, strategy |
| `docs/guide/` | The user guide — using Agenthix, for the people in an organisation |
| `docs/work/` | Units of work — each one's design spec and implementation plan |

Product and platform-wide planning documents live outside this repository. Each unit of work here keeps its design spec and implementation plan in `docs/work/<date>-<slug>/`.

**History.** The modules were once submodules of a larger repository and became plain directories here on 2026-08-09; `hq/` was then the platform application, renamed from `site/` on 2026-08-11 when the Execution Site was built as a module of its own.

**Start with [`AGENTS.md`](AGENTS.md)** for repo conventions, module boundaries, and how to work in this codebase.

## Licence

Agenthix is source-available under the [Elastic License 2.0](LICENSE), with an additional permission for running a
client's own instance. Any organisation may run it for its own use, free; offering it to others as a hosted or
managed service is not allowed. [`LICENSING.md`](LICENSING.md) says what you may and may not do, with examples.

## Contributing

Contributions are welcome: [`CONTRIBUTING.md`](CONTRIBUTING.md) says how to set up, check a change and open a
pull request. Before a first contribution is merged, its author agrees to the [contributor licence agreement](CLA.md).

If Agenthix is useful to you, please star the repository on GitHub: it helps others find it.
