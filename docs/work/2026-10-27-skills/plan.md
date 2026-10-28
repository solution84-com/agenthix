---
created: 2026-10-27
description: How skills and the asset layer are built — contracts and data first, then the Library's install and lifecycle, delivery and skills in files, the conversation side and the built-ins, templates on the same layer, the screens, and proof — so that skills are usable before templates join them.
---

# Implementation Plan · Skills and the asset layer

## Goal

A person can find, give, use and look after their agents' skills, and see when an agent used one; every Library asset
(skills, agent templates, board templates, team templates) is installed, checked, versioned and maintained through one
layer.

**In scope:** the six parts of the [spec](spec.md), all required for `0.1.0` (D22):
- **Where a skill lives** (part 1): the levels, the sort of what Agenthix ships, two built-in skills, workspace and
  personal skill sources.
- **The asset layer** (part 2): identity bound to the verified signer, self-contained packages de-duplicated by
  identity, pinned versions, draft and publish, own copies on edit, provenance, Library maintainers, history.
- **Installing from anywhere** (part 3): the package, the signed statement, a Sigstore verifier in hq, the four states,
  sources from hq's image, upload and a URL.
- **Skills in files** (part 4): scanning, the organisation's and a place's default, switches by place, path and
  fingerprint, versions by publishing, personal skills that follow at a published version, the clash order.
- **The run and the conversation** (part 5): delivery per turn, the `/` picker, the used skill opened beside the
  thread, `propose_skill`, the approval gate for an agent's publish, the listing's cost.
- **Where people meet it** (part 6): the Library in the sidebar, the editor, a place's Skills page, the agent's page,
  review and settings.
- The decision records, the documents, the user guide, the security suite and the QA contract.

**Out of scope** (recorded for later work):
- **Git repositories as an install source.** A private repository needs credentials through workflows; a URL to a
  release covers the release need.
- **A hosted registry, publishing between organisations and verified organisations.** The later publishing work; the
  Marketplace button stays behind a development-only flag (D26).
- **Different versions side by side**, such as one project held on an older version (D11). One version per
  organisation is the rule; side by side needs a pin per place and a cache of several versions.
- **A search tool over skills.** Built only if the listing's measured cost calls for it (part 5).
- **Maintainers per team or department** (D28), and per-asset maintainers. One Library maintainer role covers the need.
- **Agents, boards and teams following their template's later versions.** What a template made is its own definition
  (adr-0072); only the template is versioned.

## Approach

**Contracts and data first, because every layer reads them.** Phase 1 commits the shared shapes in `core`: an asset's
identity and manifest (format 2, with `basedOn`), the signed statement and the canonical fingerprint (reusing
`packageDigestInput`), the new staging sources and the dispatch's skill entries keyed by place, path and fingerprint,
the message's structured `skill` field, and the `skill` work target. hq's schema replaces the `Skill` table with
`Asset`, `AssetVersion`, `Draft`, `Proposal`, `TrustedPublisher`, the Library maintainer flag and `PlaceSkill` records,
keeping `PackageContent` as the content store (board 5). Before `0.1.0-rc.1` nothing is carried forward, so old rows
and the agent package's `skills/` are dropped, not converted. The listing's request size is measured on both runtimes
here, before anything changes it, so the after-figure has a baseline.

**Then the Library's lifecycle, for skills.** Phase 2 builds the install pipeline once, for every source: the existing
ZIP reader's bounds, the canonical fingerprint, a Sigstore verifier in hq (keyless with the transparency-log proof
offline against a shipped trust root, and key pairs), the four states, the publisher taken from the verified signer
with `unsigned/` and the reserved `agenthix/`, and the guarded URL fetch. On top of it: de-duplication by identity,
pinned versions with update, roll back and the withdrawn-version warning, one shared draft per asset and publish of
the exact revision seen, own copies on edit, provenance written once, Library maintainers, history, and the
permission checks with every agent's publish routed through a person's approval (D31). It works for skills first; the
other kinds join in phase 5 through the same code.

**Then what a run sees.** Phase 3 resolves an agent's skills per run in hq (built-ins, installed, the place's
switched-on file skills, the person's published skills, then the clash order) and delivers installed and personal
content by digest. The site scans places and workspaces when asked, re-fingerprints each file skill it stages and
stages only what hq named, under unique names. Places get defaults, switches and versions by publishing. The site
protocol's minor version moves; the `agent` source and the agent package's skills are marked deprecated before removal
(versioning.md).

**Then the conversation and the built-ins.** Phase 4 adds the `/` picker over `listConversationSkills`, the validated
`skill` field turned into an explicit "use this skill" instruction on both runtimes, the run's record of skills used,
the `skill` work step opening the used version with an access check, and `propose_skill` with its routing, checks and
card. The two built-ins replace the git guides kept in five places and two of the skills engineer's skills, and the shelf stops being installed
into every new organisation. With phases 1–4 merged, skills are usable end to end, before templates.

**Templates on the same layer.** Phase 5 makes agent, board and team templates assets: their packages carry their
skills, Agenthix's build copies each shared skill in from one source, installing a template de-duplicates its skills,
and what a template makes keeps a read-only "made from version" link. Kernel's three skills stay inside Kernel's
template, written from hq's image.

**Then the screens.** Phase 6 builds what the UI boards drew: the sidebar order, the Library as one searched view with
the Marketplace flag, an asset's page, the editor (a tree, CodeMirror 6 and a diff renderer behind the file frame's
boundary), the install dialogs, a place's Skills page, Your space, the agent's page, review, and settings. The diff
renderer is one component for every "what changed".

**Proof and documents last.** Phase 7 completes the security suite for the review's findings, the cross-app and e2e
scenarios, the model checks on the baseline model, the after-measurement, the user guide (a *Skills* page teaching
instructions, skills and knowledge; the glossary; the Library and agent pages), the concept and architecture
documents, and the decision records' notes. The QA contract is written at the close.

**One module per authority.** Every install goes through one pipeline in hq; every signature through one verifier;
every permission through one policy (role, Library maintainer flag, project role, agent caller); every staged skill
through the site's one staging path; every "what changed" through one diff renderer. A lane that needs one calls it.

### How the work is carried out

- **Lanes**, under the lead (`running-lanes`): one purpose, one branch and worktree, a brief naming the tasks by number,
  the spec part that is its acceptance, and the files it owns, with one shared rules file.
- **Models:** security lanes (the verifier, the install pipeline, permissions and the approval gate, staging's
  fingerprint check) run on Opus; bounded lanes on Sonnet. Every brief names its model.
- **Resource strategy, in every brief:** lanes contend for memory and CPU (typechecks, tests), the shared test
  databases and fixed ports. Lanes run only the typecheck and unit tests of what they touched, under the machine-wide
  lock for heavy commands; integration, cross-app, e2e, container and install suites run once, by the lead, after the
  lanes that change what they test. Free memory, load and swap are watched with alerts on threshold and recovery; at a
  limit, the latest-started lane pauses first, and parallelism drops before anything stops.
- **In parallel where they don't meet:** phase 1's `core` contracts merge before its schema lane; in phase 2 the
  verifier and the URL fetch run beside the lifecycle once the pipeline's shape is merged; phase 3's hq and site lanes
  run side by side; phases 4 and 5 can overlap once phase 3 is merged; phase 6's screens are parallel lanes once the
  diff renderer and the Library view are merged.
- **Merging:** lanes merge one at a time into `feature/skills`, each squashed and rebased; nothing reaches `main` until
  the unit closes.
- **Suites:** the full regression runs at the close: this unit changes `core`'s protocol shapes, both schemas and the
  site's staging.
- **The owner walks the work through** at the end of phase 6. Walkthrough fixes are lanes, added to the breakdown with
  the next numbers.
- **The lead decides inside the plan:** obvious calls are made and recorded; a security threat is closed and reported;
  a real blocker or a change of direction goes under Deviations and to the owner. The owner's input is needed at the
  walkthrough, for every push and the merge to `main`, and for anything destructive to data.
- **The branch lands** as one merge commit on `main` (`--no-ff`) when the unit closes, regrouped first.

### At the close

The close is phase 8, committed on the branch before the merge (`closing-a-unit-of-work`), in this order:

1. **The owner accepts the work** at the end of the phase 6 walkthrough and its fix lanes.
2. **The close-out tasks** (8.1–8.9) are done and committed on `feature/skills`. Open items are triaged through one
   agent that checks each against the code at head and writes one triage file; the lead reviews it before any issue is
   raised. Public issues hold only bugs, debt and chores; anything planned goes to the private planning repository.
3. **A full QA audit is offered** to the owner as their choice: long, and required before the release anyway. If it
   doesn't run, the closing note says the unit's contract entries await it.
4. **The full regression** runs once, by the lead: every module's typecheck, unit and integration suites, the
   cross-app suite, hq's e2e tests (its `not-secure` project included), the start test for each image whose content key
   changed, and the install test. Failures are fixed on the branch first.
5. **The history is cleaned up**, after a `backup/feature/skills` is made:
   - the branch is regrouped into a few ordered commits, one per layer the unit built (contracts and data, the
     Library's lifecycle, delivery and skills in files, the conversation and built-ins, templates, the screens, proof
     and documents, the close);
   - lane commits, walkthrough fixes and regression fixes are folded into the commit they fix, unless something cites
     them, in which case they stay and the merge message explains;
   - every message reads `type(area): what changed`, with nothing private in it (`writing-in-public`) and no
     attribution trailer;
   - the regrouped tree is checked to be identical to the backup's (`git diff backup/feature/skills` is empty), so the
     regression in step 4 still stands.
6. **"Merge now?"** is asked right before merging, and the merge to `main` is `--no-ff`.
7. **The push waits for the owner's say-so.** After it, the lead watches *Checks*, fixes any failure with the next push,
   and closes the public issues the unit resolved.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0072, adr-0084, adr-0101, adr-0116, adr-0117, adr-0149, adr-0150, adr-0152 — all Accepted |
| **Implements** | adr-0156 built-in skills sit beside platform knowledge; adr-0157 every Library item is a versioned asset, pinned once per organisation; adr-0158 an asset is installed from anywhere through one signed protocol; adr-0159 agents draft skills, people publish them — all accepted on this branch when the unit opened |
| **Revisits** | adr-0149 — a built-in skill now sits beside the guide; adr-0072 — Library items gain versions and a pin, and the agent package stops carrying skills; adr-0084 — new `workspace` and `person` sources, and staging checks fingerprints |

## Key decisions

| Decision | Why |
|---|---|
| One asset layer for all four kinds, now (D20) | Before `0.1.0-rc.1` it costs only the build; after it, every reshape needs migrations |
| Lifecycle on the template, not on what it made | Keeps agents, boards and teams out of the version machinery, so testing stays bounded |
| Self-contained packages, de-duplicated by identity (D10) | One rule for every source, no resolver, nothing can go missing |
| Not references between packages | A resolver across every source, and skills that can disappear |
| The publisher is the verified signer, never the manifest's claim (C1) | Otherwise any package can pose as Agenthix and be "offered as an update" |
| One version per organisation (D11) | Fixes reach everyone; "which version does Ada use?" has one answer |
| Not pins per place, not a separate roll-out step | Fixes stop reaching people, and more state for no new safety; reach is handled where trust is given (D28) |
| Draft then publish, agents draft and people publish (D24, D31) | A change reaches every agent only when a person approves it, *Bypassed* included |
| One Library maintainer role (D28) | Every asset is the organisation's; one group, one role, fewer combinations to test |
| Processes live in knowledge; skills enforce them (D29) | Knowledge is already versioned and governed; skills stay small and few |
| Off by default for skills found in files (D13, H4) | A skill an agent writes doesn't become standing instructions unseen |
| Staging re-fingerprints what it copies (H3) | Otherwise an approved skill edited after approval runs unapproved content |
| A picked skill as an explicit instruction, not a `/` command (YQ1, M7) | The runtime never parses `/`, so its bundled commands can't be reached |
| A Sigstore verifier in hq, offline against a shipped trust root | Self-hosted and air-gapped organisations install without reaching the internet |
| CodeMirror 6 and one diff renderer (D25) | hq has no code editor; one diff serves drafts, updates, proposals and files |
| Not Monaco | Heavier, and harder to fit behind the file frame's boundary |
| Old `Skill` rows and the agent package's `skills/` dropped, not converted | Clean slate until `0.1.0-rc.1` |

## Work breakdown

Eight phases, split on the seams the design has: shapes everyone reads (1), the Library's lifecycle in hq (2), what a
run receives (3), the conversation and built-ins (4), templates joining the same layer (5), the screens (6), proof (7),
and the close (8). Skills are usable end to end after phase 4.

### Phase 1 — Contracts, data and the baseline
**Delivers:** the shared shapes in `core`, hq's new records, and today's listing cost measured.
**Starts when:** —
**Execution plan:** none — lanes. Shapes are decided in the spec and boards 5–6; nothing is migrated.

- [x] 1.1 Measure each part of a request on both runtimes today, as the baseline
- [x] 1.2 `core`: asset identity, manifest format 2 with `basedOn`, SemVer comparison
- [x] 1.3 `core`: the signed statement and the canonical fingerprint
- [x] 1.4 `core`: staging sources (`workspace`, `person`), dispatch skill entries by place, path and fingerprint, and the deprecation marks
- [x] 1.5 `core`: the message's `skill` field and the `skill` work target
- [x] 1.6 `core`: the Marketplace feature flag
- [x] 1.7 hq schema: `Asset`, `AssetVersion`, `Draft`, `Proposal`, `TrustedPublisher`, Library maintainer flag, `PlaceSkill` and `PlaceSkillVersion`, settings; `Skill` and `SkillScope` removed
- [x] 1.8 hq: `PackageContent` kept for every installed or used version, and the sweep changed to match
- [x] 1.9 Site: records of skills a run used

### Phase 2 — Installing and the Library's lifecycle (skills)
**Delivers:** skills install from hq's image, an upload or a URL through the signed check, and are versioned, edited,
published, rolled back and maintained, with every agent's publish going through a person's approval.
**Starts when:** phase 1 is merged.
**Execution plan:** none — lanes. Security lanes on Opus.

- [x] 2.1 The install pipeline: ZIP reader bounds, duplicate and case-colliding entries refused, the fingerprint over exactly what is stored
- [x] 2.2 A Sigstore verifier in hq: keyless with exact identity and ref, the transparency-log proof offline, key pairs, the shipped trust root and its age
- [x] 2.3 The four states, the publisher from the verified signer, `unsigned/`, the reserved `agenthix/`
- [x] 2.4 Sources: hq's image shelf, upload, and the guarded URL fetch
- [x] 2.5 Trusted publishers, unsigned assets and who may install from outside (P1–P3)
- [x] 2.6 De-duplication by identity on install, and what comes with it (I3, I6)
- [x] 2.7 Pinned versions: update, roll back, any version on purpose, the withdrawn-version warning
- [x] 2.8 Drafts: one per asset, shared, with each change's author; publish of the exact revision seen
- [x] 2.9 Editing a signed asset makes the organisation's own copy, which takes its place
- [x] 2.10 Provenance written once; *verified* only for lines hq wrote
- [x] 2.11 Agents with this skill: every agent or chosen agents; remove names who has it
- [x] 2.12 Library maintainers, the reach warning on naming, and history of who did what
- [x] 2.13 One permission policy: role, Library maintainer, project role, and agent callers
- [x] 2.14 An agent's publish, roll back, switch on and install as approval cards, *Bypassed* included
- [x] 2.15 Validation against the Agent Skills rules on every save, upload and install

### Phase 3 — Delivery and skills in files
**Delivers:** a run receives exactly the skills the design says, with file skills scanned, switched, versioned by
publishing and checked as they are staged, and a person's published skills following them.
**Starts when:** phase 2's install pipeline and versions (2.1–2.7) are merged.
**Execution plan:** none — lanes. The staging check runs on Opus.

- [x] 3.1 hq resolves an agent's skills per run, with the clash order (installed, project, person)
- [x] 3.2 Installed and personal content delivered by digest, once per version; caches bounded
- [x] 3.3 The site scans a place and its workspaces' three folders when asked, under bounds
- [x] 3.4 Staging re-fingerprints each file skill and stages only what hq named, by place and path
- [x] 3.5 Unique staged names per run, workspace and folder; a clash stages neither
- [x] 3.6 The organisation's default (shipped off by default), a place's stricter default, switches, all on and all off
- [x] 3.7 Place skills versioned by publishing: drafts in hq, publish through the site, `metadata` version, roll back
- [x] 3.8 Changed in files, not published: detected, shown, publish or put back
- [x] 3.9 A person's published skills follow them into their own conversations; the organisation's switch
- [x] 3.10 Project administrators publish; organisation administrators govern through the default only
- [x] 3.11 Site protocol minor version, and the `agent` source and agent package skills marked deprecated
- [x] 3.12 Claude's plugin and allowlist and OpenCode's list and skill tool fed from the new sets

### Phase 4 — The conversation and the built-ins
**Delivers:** people pick a skill with `/`, see the skill a run used, and get agents' proposals as drafts or
proposals; the two built-ins replace the copies, and new organisations stop receiving all 18 skills.
**Starts when:** phase 3 is merged.
**Execution plan:** none — lanes.

- [ ] 4.1 `listConversationSkills`, and the `/` trigger on the `@` picker's hook
- [ ] 4.2 The `skill` field on the message, validated by the site, invoked as an explicit instruction on both runtimes
- [ ] 4.3 Typed `/` text escaped so the runtime never parses it as a command
- [ ] 4.4 The run's record of skills used sent to hq; the `skill` work step with the person-facing name
- [ ] 4.5 The used skill opened beside the thread at its version, with access checked at view time
- [ ] 4.6 `propose_skill`: arguments, the on-behalf-of person, checks, a limit per run
- [ ] 4.7 Routing: the person's own draft from their interactive conversation, otherwise a proposal to the aimed level
- [ ] 4.8 The proposal and draft card in the conversation, and the outcome told to the agent
- [ ] 4.9 Built-in `working-with-git`, staged only in a workspace with a repository, replacing the git guides kept in five places
- [ ] 4.10 Built-in `skill-creator`, teaching instructions, skills and knowledge, replacing codify and propose
- [ ] 4.11 The shelf of 17 with *suited to* hints; a new organisation installs none by itself
- [ ] 4.12 Built-in switches for the organisation

### Phase 5 — Templates on the same layer
**Delivers:** agent, board and team templates are assets like skills, carry their skills built from one source, and
de-duplicate them on install.
**Starts when:** phase 2 is merged; can overlap phase 4 once phase 3 is merged.
**Execution plan:** none — lanes.

- [ ] 5.1 Agent, board and team templates installed, versioned and checked through the asset layer
- [ ] 5.2 Agenthix's build copies each shared skill into the templates that use it, from one source
- [ ] 5.3 The 26 hand-kept copies removed from the team templates
- [ ] 5.4 Installing a template de-duplicates its skills by identity
- [ ] 5.5 What a template makes keeps a read-only "made from version" link
- [ ] 5.6 Kernel's three skills inside Kernel's template, never offered
- [ ] 5.7 Importing and exporting agents and templates through the asset layer, with dependencies inside

### Phase 6 — The screens
**Delivers:** everything people meet, as drawn on the UI boards.
**Starts when:** phases 2–5 are merged for the screens each one uses; the diff renderer and the Library view merge first.
**Execution plan:** none — lanes.

- [ ] 6.1 The sidebar: Home, Chat, Your space, Projects, Tasks, Agents, Library
- [ ] 6.2 The Library as one searched view with type and status filters; the Marketplace button behind its flag
- [ ] 6.3 An asset's page: content, agents with it, versions, news, credit and licence, signer and source, remove
- [ ] 6.4 Add: the shelf, upload, a link, new skill, and the four install dialogs with the unsigned tick
- [ ] 6.5 A diff renderer behind the file frame's boundary, in one column
- [ ] 6.6 CodeMirror 6 in `ui/`
- [ ] 6.7 The editor: the tree with change markers, View, Edit and Changes, checks, ask an agent, publish; the old screen's direct save and delete (`updateLibrarySkill`, `deleteLibrarySkill`, `publishMadeHereEdit`) removed
- [ ] 6.8 Update, change of publisher, roll back and own copy screens
- [ ] 6.9 A project's Skills page: groups, versions, switches, defaults, add to this place, the private group
- [ ] 6.10 Your space's Skills page and the person's skills that follow them
- [ ] 6.11 The agent's page: everything it will see, set aside and why, the cost estimate; the member's view
- [ ] 6.12 Review: proposals by level, line by line, accept, edit then accept, reject with a note; the Overview item
- [ ] 6.13 Settings: *Library and skills* in the admin area
- [ ] 6.14 The approval card for an agent's publish request

### Phase 7 — Proof and documents
**Delivers:** the unit proved against its spec and the security review, and described where people and agents read it.
**Starts when:** phase 6 is merged.
**Execution plan:** none — lanes.

- [ ] 7.1 Security suite for every finding in the review (C1, H1–H5, M2–M7, L1–L5)
- [ ] 7.2 Cross-app scenarios: delivery, the files gate, personal skills, picked skills on both runtimes, typed bundled commands refused
- [ ] 7.3 e2e specs for the Library, the editor, a place's Skills page, the agent's page, the conversation and review
- [ ] 7.4 Model checks on the baseline model: uses a given skill, follows a picked one, proposes rather than writes, answers "what can you do?"
- [ ] 7.5 The listing's cost measured again on both runtimes, against 1.1
- [ ] 7.6 User guide: a *Skills* page, the glossary, the Library and agent pages, the stale task-management line
- [ ] 7.7 Concept documents: skills, the Library, knowledge's relation to skills
- [ ] 7.8 Architecture documents: delivery, the install protocol, the site protocol's changes
- [ ] 7.9 The Sigstore trust root's refresh run by the release rehearsal

### Phase 8 — Close
**Delivers:** the unit's record complete, nothing left open or untracked, and what it changed described everywhere it's
read; the branch ready to merge.
**Starts when:** the owner has accepted the work after the phase 6 walkthrough, and phase 7 is merged.
**Execution plan:** none — by hand, with one triage agent and document agents split by area.

- [ ] 8.1 Every open item gathered from the plan, lane reports, walkthrough, security review and handover, and triaged against the code at head
- [ ] 8.2 Each one closed with its evidence, or raised as an issue with type and priority
- [ ] 8.3 Any critical item fixed, or raised at High with *Blocks release* for `agenthix@v0.1.0`
- [ ] 8.4 The QA contract: stories and scenarios for what the unit built, written from the finished code, and the tests that cover them tagged `@SC`
- [ ] 8.5 The QA model in `docs/qa/README.md` current
- [ ] 8.6 Notes on every decision record this unit implements, and the ones it revisits superseded or annotated; the index updated
- [ ] 8.7 The epic, kept outside this repository, given its completion comment, with its open sub-issues re-homed where the owner says
- [ ] 8.8 The line's roadmap and delivery record, kept outside this repository, updated
- [ ] 8.9 Deviations completed for every phase, and a dated closing note: who accepted the work, items closed and deferred, whether an audit ran, the records updated

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | Task 1.7 adds the new records but leaves `Skill` and `SkillScope` in place; they are removed in phase 2 with the code that reads them (2.6) | Removing the table in phase 1 would leave the Library's skill actions broken until phase 2 rewrites them; the removal belongs with their replacement |
| 2 | A keyless signer's identity is the certificate's identity less the ref it ran from, with the ref checked on its own; an unknown key-pair signer is refused as unverifiable, not offered as a new publisher (spec part 3 *Who signs*, amended) | A workflow's certificate identity ends in its ref, so comparing it whole made every tag release a different signer; a key-pair bundle doesn't carry its key, so there's nothing to verify until it is trusted |
| 3 | A person's skills reach the agents their own conversation hands work to, not only the conversation's own turns (spec part 4 *The person's skills*, amended) | A conversation's lead answers in hq and every agent turn runs as work it hands on; excluding that work meant personal skills, and the `/` picker for them, reached almost nothing. It is still the person's own request, within their access |
| 3 | Publishing, adding and removing a place's skill go through a new site call that writes or removes a whole skill folder (spec part 4 amended); site protocol 1.11 | The spec assumed a general site file write existed; the only one writes new files and never replaces, so no place skill could be published |
