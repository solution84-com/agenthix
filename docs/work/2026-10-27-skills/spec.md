---
name: Skills and the asset layer — spec
description: People find, give, use and look after their agents' skills, and see when an agent used one; every library asset (skills, agent, board and team templates) shares one layer — identity, a signed install from any source, provenance, pinned versions, history and maintainers — while skills in a place's files are listed and switched, and a person's own skills follow them.
created: 2026-10-27
author: leang
---

# Skills and the asset layer — spec

**Status:** Approved by the owner on 27 October 2026. Settled on the design boards (decisions D1–D32 and defaults
R3–R11 on the boards' *Questions and decisions*, each cited where it applies), and reviewed for security the same day
(findings folded in, each cited). The boards, kept under [`boards/`](boards/), are the build baseline. Each part has its own file under
[`spec/`](spec/), and the implementation plan is [`plan.md`](plan.md).

## Purpose and outcome

Agents already *run* skills well: they are staged for every turn on both runtimes (adr-0084). People can barely
*reach* them. A skill is installed by copying it, and the copies go stale. A new organisation gives every agent all 18
library skills. Nobody can see what an agent will use. Skills an agent writes into a project are live at once, and
nothing in a conversation lets a person pick a skill or see one used.

**Outcome:** a person can find, give, use and look after their agents' skills, and can see when an agent used one.
Every asset in the Library (skills, agent templates, board templates, team templates) is installed, checked, versioned
and maintained the same way.

A person should be able to answer, without help:

1. **What can my agents do?** Which skills exist here, and which agent will use which.
2. **How do I get an agent to do it?** Give it the skill, then ask for it or pick it in the message box.
3. **Did it do it that way?** The work shows which skill was used, and opens it.
4. **How do we keep them right?** Install from anywhere with a clear check, update on purpose, roll back, see who
   changed what, and review what agents propose.

## The problem, numbered

| # | Today | Effect |
|---|---|---|
| T1 | The Library is reached only from an Overview card. Its skill action reads *Use*, and its only install is *Install to Org* | People don't find skills, and the words don't say what happens |
| T2 | Installing makes a copy, in the organisation's package or an agent's | Copies go stale silently. A real case: an out-of-date git skill told agents to push directly |
| T3 | A new organisation gets all 18 library skills for every agent | About 11k tokens of listings and tool descriptions on every request |
| T4 | An agent's page lists only its own copies, and its picker offers only library skills | Nobody sees an agent's whole set |
| T5 | No view of what the organisation installed, and no remove | A skill that is wrong for the organisation can't be taken out |
| T6 | A skill an agent writes into a place's files is live on its next turn | Standing instructions nobody reviewed, for everyone using that agent there |
| T7 | The message box can't pick a skill, and a typed `/name` reaches the runtime, its bundled commands included | People can only ask for a skill by describing it |
| T8 | A used skill shows under its staged name, and opens nothing | People can't see what the agent followed |
| T9 | Only administrators touch skills, and nothing records who changed what | Nobody else can look after a skill, and a bad edit can't be undone |
| T10 | Before an organisation exists, a taken name can overwrite another skill's file | Silent loss of a skill's content |
| T11 | Team templates carry 26 copies of skills, and three different git guides sit in five places | The copies drift apart |
| T12 | Skills in a workspace's repository (`.claude/skills`, `.agents/skills`, `.github/skills`) are ignored | Teams' existing skills don't work in Agenthix |

## The rule

**Two worlds, one run.** *Installed* assets are held by hq: one per identity, checked on the way in, pinned, versioned
and maintained. *Skills in files* belong to whoever owns the files: hq lists them, switches them and never pins them. A
run stages both, per turn, by fingerprint, and settles a clash by a fixed order: installed, then the project, then the
person (D16).

## Terms

**Instructions, skills and knowledge** (D29). Three things shape what an agent does, and the line between them decides
where anything is written:

| | Steers the agent? | When it applies | Holds |
|---|---|---|---|
| **Instructions** (`AGENTS.md`, the organisation's and the project's) | Yes, always | Every turn | Standing rules for all work |
| **Skill** | Yes, explicitly, for one kind of task | When a task matches its description, or a person picks it with `/` | A routine the agent must follow, often with scripts |
| **Knowledge** | No, not by itself | When the agent looks something up | Policies, guidance, processes, reference, decisions |

**A skill instructs; knowledge informs.** Processes are where they overlap: a process lives in knowledge, owned and
versioned there, and a skill is what makes it binding ("when asked for release notes, follow
`org:processes/release-notes`"). A policy is enforced the same way, by the instructions or a skill naming it. The
user guide's *Skills* page and the built-in `skill-creator` teach this rule: to make agents do something a certain
way, write a skill (or a line in the instructions, if it applies to everything); to give them something to know,
write knowledge; for a process, write it once in knowledge and let a skill enforce it.


- **Asset:** a library item: a skill, an agent template, a board template or a team template. One ZIP package with a
  manifest (`package.json`).
- **Identity:** `publisher/name`, plus a version. The same name from a different signer is a different asset (D10).
- **Installed:** held by hq for the organisation, one per identity, pinned to a version (D11).
- **Built-in skill:** shipped in hq's image and on for every agent. It can be switched off, and is never edited (D6).
- **Offered:** shipped in hq's image, and installed only when someone chooses it.
- **Skills in files:** skill folders in a place's files, one agent's folder there, a workspace's repository, or a
  person's own space.
- **Has:** the word for an agent and a skill: *Ada has Code Review*. Never "given to" (D23).
- **Draft, publish:** an edit is a draft that no agent sees; publishing makes the next version. Agents draft, people
  publish (D24).
- **Library maintainer:** an organisation role, named by administrators, that looks after every Library asset (D28).
  A project's skills are published by its administrators.
- **Fingerprint:** one digest over a skill's or package's files, the same idea hq already uses to deliver content.
- **Provenance:** the "based on" list a copy carries, written once when the copy is made (D19).

## The parts

| Part | File | Covers |
|---|---|---|
| 1 | [Where a skill lives](spec/01-levels.md) | The levels L1a–L6 and the person; what Agenthix ships, sorted; built-in skills beside platform knowledge |
| 2 | [The asset layer](spec/02-assets.md) | Identity, self-contained packages, de-duplication, pinned versions, editing makes your own copy, provenance, maintainers, all four kinds |
| 3 | [Installing from anywhere](spec/03-install.md) | The protocol: package, fingerprint, signature; the four states; who signs; sources; the organisation's settings |
| 4 | [Skills in files](spec/04-files.md) | Listing, defaults and switches; the person's skills; the order when the same skill comes from two places |
| 5 | [The run and the conversation](spec/05-run.md) | Delivery per turn; picking a skill; seeing it used; proposing one; the cost of the listing |
| 6 | [Where people meet it](spec/06-screens.md) | The Library in the sidebar, the editor, a Skills page per place, the agent's page, the conversation, settings |

## In this unit, in order

All of it is required for `0.1.0` (D22), built so that skills are usable first (D20):

1. **The asset layer, with skills on it:** parts 1–5 for skills.
2. **Templates on the same layer:** agent, board and team templates, and the build copying each skill from one source.
   If anything has to move, this step moves whole, never half-built.
3. **The screens** (part 6), and the owner's walkthrough.

**Later, recorded for follow-up work:** git repositories as a source; a hosted registry, publishing and verified
organisations; different versions side by side; a search tool over skills, if measuring the listing calls for it.

**Not in scope:** publishing between organisations, and a marketplace (D3).

## Decision records

Accepted on the unit's branch when it opened:

- **adr-0156, built-in skills sit beside platform knowledge** (D6, D29): a built-in tells an agent what to do and
  points to the guide for what things are. Narrows adr-0149.
- **adr-0157, every Library item is a versioned asset, pinned once per organisation** (D10, D11, D18–D20, D28, D30):
  identity, self-contained packages de-duplicated by identity, pinned versions, own copies on edit, provenance, Library
  maintainers. Narrows adr-0072 for library items; things made from a template stay their own definitions.
- **adr-0158, an asset is installed from anywhere through one signed protocol** (D7–D9).
- **adr-0159, agents draft skills, people publish them** (D13, D24, D25, D31, D32): every edit is a draft until a
  person with the right at that level publishes it, and a skill in files runs only as its place's switches allow.

## Testing

- **Unit:** identity and de-duplication, version pinning and roll back, provenance (inherit, append once, never
  rewritten), the four install states, the clash order, the defaults and switches, validation against the Agent Skills
  specification.
- **Integration (hq):** install from image, upload and URL for each kind; update and roll back; editing makes a copy;
  removal names what depends on it; the role-by-action matrix for administrators, Library maintainers, project administrators and members (D28).
- **Cross-app:** an installed skill reaches the run; a file skill that is off is not staged and one switched on is; a
  changed file goes off under *off by default*; a person's skill reaches their conversation in a project and not a
  scheduled run; a picked skill invokes on both runtimes; a typed bundled command does not.
- **e2e:** the Library and an asset's page; a place's Skills page and its switches; the agent's full list; the `/`
  picker, a used skill opened beside the conversation, and a proposal reviewed.
- **Model checks on the baseline (DeepSeek Flash):** an agent uses a given skill when the task matches; follows a
  picked skill; proposes rather than writes a skill; answers "what can you do?" from its list.
- **Measurement:** the size of each part of a request on both runtimes, before and after.
