# Skills (Library)

A library skill is a pre-authored `SKILL.md` template — a reusable behavioral instruction set that can be browsed in the Library, added to agents, and referenced by agent and workforce templates. The library is the catalogue; active skill copies on the filesystem are what agents actually run.

---

## Relationship to active skills

The library and active runtime are separate layers:

| Layer | Location | Purpose |
|---|---|---|
| **Library** | `Skill` DB table (scope = PLATFORM) | Browsable catalogue; source of truth for template content |
| **Active** | `skills/<slug>/` inside an agent's, the org's or the platform's package, or in a project's or person's own storage — under `.agents/agents/<agentId>/skills/<slug>/` for one agent, or `.agents/skills/<slug>/` for every agent working there | Staged afresh for each turn as `<source>-<slug>`, then shown to the model by the runtime: Claude gets a local plugin plus a name allowlist, OpenCode a list in the system prompt plus the plugin's skill tool (see [skills.md](../skills/skills.md)) |

A skill is "installed" when its content is copied from the library into an agent's package (or the org's package), edited in place; the next run uses it. The copy records `installed_from` in its frontmatter. The library record is never modified at runtime — it is the canonical template.

---

## Source files and seeding

Library skills are authored as `SKILL.md` files in `assets/library/skills/<slug>/` and seeded into the `Skill` DB table at startup via `seedPlatformSkills()`. The DB record stores only metadata — `slug`, `name`, `description`, `version`, and an `assetPath` pointer. Content is read from hq's assets (or hq's storage, for an org skill) when a skill is installed into an agent's package or exported.

```
assets/library/skills/<slug>/SKILL.md  →  Skill { slug, name, description, assetPath: 'library/skills/<slug>', scope: PLATFORM }
```

Seeding is version-gated: if the stored `version` matches the file's frontmatter, the record is skipped. Bump `version` to force an update on next startup.

Org skills (created via the Skills UI) are stored under `org/skills/<slug>/SKILL.md` in hq's own storage (`<HQ_STORAGE_ROOT>/org/skills/`), with `assetPath = 'org/skills/<slug>'`. They share the same `Skill` table with `scope = ORG`.

---

## DB schema

```prisma
model Skill {
  id          String     @id @default(cuid())
  slug        String
  name        String
  description String
  assetPath   String     // relative path — resolve under hq's assets root (PLATFORM) or hq's storage root (ORG)
  version     Int        @default(1)
  scope       SkillScope // PLATFORM | ORG
  source         LibrarySource @default(MADE_HERE)   // built in, made here or marketplace
  packageVersion String        @default("1")        // the version as its publisher numbers it
  publisher      String?
  orgId       String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@unique([slug, scope, orgId])
}
```

(Shown without the relation fields. `source`, `packageVersion` and `publisher` are the package facts described in [library.md](./library.md).)

Library skills have `scope = PLATFORM` and `orgId = null`. Org skills share the same table with `scope = ORG` and their `orgId` set. There is no `PROJECT`-scoped library skill — a project's own skills are files in the project's storage — under `.agents/agents/<agentId>/skills/` for one agent, or `.agents/skills/` for every agent working there — and have no DB record.

---

## SKILL.md format

```markdown
---
name: Human-readable name
description: One sentence — what does this skill do?
---

# Skill Name

Body is free-form markdown. Write instructions the agent will follow.
```

The `version` field is optional in frontmatter (defaults to 1). Bump it to force a re-seed.

---

## Slug prefixing conventions

Library skills use a flat directory structure. To prevent collisions and aid discoverability, slugs are prefixed by role or domain:

| Prefix | Domain | Examples |
|---|---|---|
| `pm-` | Product Manager | `pm-backlog-management`, `pm-sprint-planning` |
| `dev-` | Developer | `dev-code-review`, `dev-ui-development` |
| `qa-` | QA | `qa-test-planning`, `qa-bug-reporting` |
| *(none)* | Domain-specific | `content-writing`, `research-methodology`, `technical-writing` |

Domain-specific skills (no prefix) are authored for workforce templates that define inline agents — roles with no canonical template (e.g. Content Studio, Research Lab).

---

## Library skills (18 total)

The role skills that agent templates carry (for example `fix-bug`, `write-brief`, `orchestrate`) are not library skills; they live inside those templates.

| Slug | Role |
|---|---|
| `pm-backlog-management` | Product Manager |
| `pm-sprint-planning` | Product Manager |
| `pm-stakeholder-comms` | Product Manager |
| `dev-ui-development` | Developer |
| `dev-api-development` | Developer |
| `dev-code-review` | Developer |
| `dev-code-quality` | Developer |
| `dev-github-operations` | Developer |
| `qa-test-planning` | QA |
| `qa-bug-reporting` | QA |
| `content-writing` | Domain |
| `content-review` | Domain |
| `editorial-planning` | Domain |
| `seo-research` | Domain |
| `technical-writing` | Domain |
| `research-methodology` | Domain |
| `research-reporting` | Domain |
| `data-analysis` | Domain |

---

## Bundled form

Skills themselves have no bundled form — the `Skill` row indexes a `SKILL.md` file under hq's assets or hq's storage. An agent archive embeds the skill files it carries; importing it replaces the agent's content and settings in place and does not touch the `Skill` table.

---

## Related

- [library.md](./library.md) — library overview and file → DB seeding pattern
- [agent-templates.md](./agent-templates.md) — agent templates reference skills by slug in `skills[]`
- [workforce-templates.md](./workforce-templates.md) — workforce templates reference skills via agent definitions
- [skills.md](../skills/skills.md) — skill sources and how they are staged for each turn
- [authoring-skills.md](../skills/authoring-skills.md) — SKILL.md format and how to author a skill
