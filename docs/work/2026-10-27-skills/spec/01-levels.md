# 1 · Where a skill lives

Part of the [Skills and the asset layer spec](../spec.md). Boards 2 and 2b.

## The levels

| | Level | Kept where | Applies to | Changed by |
|---|---|---|---|---|
| L1a | **Built in** | hq's image: the platform package (`hq/assets/platform/skills/`) | Every agent in every organisation; an administrator may switch one off | Agenthix, with each release |
| L1b | **Offered** | hq's image: the shelf (`hq/assets/library/skills/`) and the templates | Nobody until installed | Agenthix, with each release |
| L2 | **Installed for every agent** | hq: the organisation's installed assets | Every agent in the organisation | Administrators; Library maintainers edit (D17) |
| L3 | **Installed for chosen agents** | hq: the same installed assets, had by those agents | Those agents, wherever they work | Administrators; Library maintainers edit |
| L4 | **A place, every agent** | Site: `files/.agents/skills/` in a project's storage or a person's own space | Every agent working in that place | Whoever can write the place's files, agents included |
| L5 | **A place, one agent** | Site: `files/.agents/agents/<agent id>/skills/` | That agent, in that place | The same |
| L6 | **A workspace's repository** | Site: `workspaces/<id>/` in `.agents/skills/`, `.claude/skills/` and `.github/skills/` | Runs working in that workspace | Whoever commits to the repository |
| P | **The person** | Their own space's L4 and L5 | Their own conversations, everywhere (D15) | The person |

L1–L3 are **installed** and follow [the asset layer](02-assets.md). L4–L6 and the person's skills are **in files** and
follow [part 4](04-files.md). L6 is new: staging reads a workspace's repository in all three folders that teams use
(D14). The person's skills are new outside Your space (D15).

A run names each skill `<source>-<slug>`, as now (adr-0084); workspace skills get a source of their own, and the
person's skills one too (`person-<slug>`). **Every staged name is unique within a run** (security review M2): a
workspace's skills are named per workspace and folder (for example `workspace-<n>-<slug>`), two skill folders never
merge into one staging folder, and a clash stages neither. The name-length limit accounts for the longest source.

## What Agenthix ships, sorted (D6, D14)

Today hq's image holds 68 skill folders: 18 library skills, 24 role skills inside 6 agent templates, and 26 copies
inside 5 team templates. The 23 library-identical copies match their library skill byte for byte below the header,
and the 3 team `git-workflow` copies match each other.

| Kind | Test | Skills |
|---|---|---|
| **Built in (2)** | Every agent needs it to work in Agenthix, whatever its role | `working-with-git`, made from the library's `dev-github-operations` and every `git-workflow`, staged only when the run works in a workspace with a repository; `skill-creator`, made from the skills engineer's `codify-skill` and `propose-skill` |
| **Kernel's own (3)** | It is that agent's job alone | `assembly`, `orchestrate`, `planning`, kept inside Kernel's template and written from hq's image, never offered |
| **Role skills (19)** | Written for one role, and refer to each other | Inside their agent templates: product manager (5), project manager (5), QA (3), wasp developer (3), skills engineer (2) |
| **Offered (17)** | Trade know-how that suits some agents | Developer: `dev-api-development`, `dev-code-quality`, `dev-code-review`, `dev-ui-development`. Product: `pm-backlog-management`, `pm-sprint-planning`, `pm-stakeholder-comms`. QA: `qa-bug-reporting`, `qa-test-planning`. Content: `content-writing`, `content-review`, `editorial-planning`, `seo-research`, `technical-writing`. Research: `research-methodology`, `research-reporting`, `data-analysis` |

Each offered skill carries a *suited to* hint that the picker uses to suggest it. A hint, not a lock. A new
organisation installs no offered skill by itself; built-ins are on, and templates bring what their agents need (D14).

Team templates stop carrying hand-kept copies: the build copies each skill into every package that uses it, from one
source ([part 2](02-assets.md#self-contained-packages)).

## Built-in skills beside platform knowledge (D6)

A built-in skill is written **for the agent**: it says what to do. The user guide, which agents search as the
`platform:` knowledge level (adr-0149), says what things are. They work together. A built-in gives the steps and
points to guide pages rather than describing the product again, so duplication stays small. A built-in ships and
updates with hq, so it can't go stale. This narrows adr-0149, which rejected a platform skill as a second description
of the product; a decision record says so.

The user guide's line that task management is an always-on skill is out of date and is corrected: task management,
knowledge and workflows reach agents as tools and instructions.
