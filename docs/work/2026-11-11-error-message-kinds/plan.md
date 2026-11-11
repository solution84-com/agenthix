---
name: Kinds of error message, and a strategy for error handling — plan
description: The phases of the error-message kinds unit, from recounting every message to proving none stops the person that should not.
created: 2026-11-11
---

# Kinds of error message, and a strategy for error handling — plan

## Goal

Every message the screens of hq and the Fleet Console give is on one of the sixteen handlers in the
[spec](spec.md), so a dialog stops the person only when stopping them is the point, and an error-handling skill keeps
it that way.

**In scope:** every message in `hq/src`, `ui/src` and `console-web/src`; the shared pieces each handler needs; the
design guard; the error-handling skill; `ui/DESIGN-SYSTEM.md` *Messages*; the guide pages that describe a dialog that
goes.
**Out of scope:** an Undo toast in place of a delete's confirm (it needs deletions that can be taken back);
server-side error responses and logging (this is what the person sees); rewording messages beyond what moving them
needs.

## Approach

**Recount before building.** The 11 November triage is from before the pre-release fixes moved files, and it classed a
few dozen rows from the scan's short words rather than the code. Phase 1 finds every message again and maps it to a
handler. It is done twice over, in different ways, so neither alone is trusted: read-only agents read the code in
slices and give each message a row (where, the situation, its kind, its handler, the change); a mechanical search for
every way a message is made today (`useAttention`, `useAttentionWhen`, `ShowAttention`, `ReadFailure`, the console's
`Notice`, the confirm dialogs, `alert(`, `confirm(`) counts them per file. The lead merges the rows into one map and
compares it with the search, so a message the agents missed shows up. The map is the target the rest of the unit
builds to.

**The shared pieces go first, as one commit**, so every lane builds on them rather than drawing a handler its own way:
the toast, the nudge, the frame line, one confirm dialog, the retry policy, `useBackgroundRead`, the required `kind`,
and the design guard's new rules. The first draft of the skill and the new *Messages* section land with them, written
from the spec and the map, so the builders follow them from the start.

**Then every message moves to its mapped handler**, in lanes by area of the code. Each lane updates the tests that
looked for the dialog it removes, in the same commit.

**A usability reviewer at every gate.** The design system unit had a reviewer for how screens look; nobody checked
what a screen does when something fails, and that is how dialogs that stop the person got through. The usability
reviewer is a read-only agent (it reads code, runs the app in a browser and takes screenshots, and writes only its
report), kept in the organisation's development plugin beside the code reviewer so every product can use it, reading
this repository's error-handling skill for the rules. It asks: does anything stop a person who did not just press
something; is every failure said by its mapped handler; can the person carry on; is anything missable that must not
be (a failed press); does anything jump or cover a control. It rates findings Critical (the person is stopped or
misled), Should fix (the wrong handler, but usable) or Minor. It checks the map in phase 1 (every judgement call and a
sample of the rest), and each lane in phase 3 by **making things fail on purpose** in the running app: the network cut,
a site asleep, HQ stopped.

**Verify by a second count, the other way round.** Fresh agents that built nothing go through the map row by row and
check each message is on its handler in the code; the mechanical search shows any message the build added that is not
in the map; the guard test fails on what it refuses. No count can prove how the product feels, so the usability
reviewer then walks the whole failure list in the running app, and the owner playtests last. The skill is finished
from what passed.

### How the work is carried out

- **Phase 1** runs as parallel read-only agents (Sonnet), one per slice of the code, each writing its own file under
  `execution/`; the lead writes the mechanical search and merges. The usability reviewer (Opus) checks the map; the
  owner sees the counts per handler and only the calls the reviewer could not settle.
- **Phases 2 and 3** run as lanes (`running-lanes`): one purpose, one agent (Sonnet), one branch and worktree each,
  briefed from this plan, the spec, the map's rows for its area and the skill draft. Phase 2 is one lane, alone.
  **Lanes that could touch the same file run one after the other**; only file-disjoint lanes run in parallel. Each
  lane lands squashed onto the unit's branch, one at a time.
- **After each phase 3 lane**: the usability reviewer and the designer reviewer, independent of the builder, each in
  their own check; Critical and Should fix go back to the builder, **at most two rounds**, with the exit criteria
  written before the first round; what remains goes on the close list.
- **The lead runs the suites lanes may not** (the integration and cross-app suites, images) once the lanes are
  combined; lanes run the typecheck and the tests of what they changed.
- **Resource strategy** (in every brief): phase 1 agents only read, so they run together. In phases 3 and 4, at most
  five agents run an hq and its site at once; heavy commands (typechecks, test runs, builds) go through one
  machine-wide lock as in the last unit; free memory and swap are watched, and at the threshold the reviewers pause
  before the builders.
- **The owner walks the work in phase 4**, after the usability reviewer's walk passes.
- **The branch** `feature/error-message-kinds` merges to `main` with `--no-ff` at the unit's close, on the owner's
  approval. Nothing is pushed until the full regression has run over this batch of units.

## Decision records

| | Records |
|---|---|
| **Depends on** | None |
| **Implements** | [ADR-0185](../../adr/adr-0185-a-dialog-only-when-stopping-the-person-is-the-point.md) — a dialog only when stopping the person is the point; each message on one of the named handlers |
| **Revisits** | None (the rule it replaces, "every message is a dialog", lived in `ui/DESIGN-SYSTEM.md`, not a decision record) |

## Key decisions

| Decision | Why |
|---|---|
| Sixteen named handlers, and nothing else | A builder picks from a closed list; a new way of saying something is a design change, not a local choice |
| A failed press stays a dialog | It is the one message the person waits for; making it missable would trade one usability problem for another |
| A toast, only for a press that worked whose result the screen does not show | Says it without stopping the person; kept off errors so a failure is never missable |
| The frame line only for HQ as a whole | Only the browser knows HQ is unreachable, so the bell cannot say it; anything about one thing goes to Notifications |
| Recount before building, by two methods | The morning's triage is stale and partly classed from short words; a mechanical search catches what agents miss |
| A usability reviewer, read-only, at every gate | The last unit had only a visual reviewer, and dialogs that stop the person got through |
| The reviewer in the organisation's plugin, rules from the repository's skill | Every product needs the check; each product's rules stay with its code |
| Against: keeping one rule (a dialog for everything) | The playtest found it too heavy: being stopped on page after page drives people away |
| Against: an Undo toast instead of a delete's confirm | Needs deletions that can be taken back; a change of its own |
| Against: one lane per kind across the whole code | Lanes would collide in the same files; lanes by area, sequenced where they could share a file |
| Against: an execution plan for any phase | Phase 1 is discovery; the others are lanes from the map, whose rows are the steps |

## Work breakdown

Five phases. The seams: the map must exist before anything is built to it; the shared pieces must land before any lane
uses them; the build must be finished before it can be counted and walked; the skill is finished only from what passed.

### Phase 1 — Recount and map
**Delivers:** one map of every message, each on a handler, with counts per handler, checked by the usability reviewer
and its open calls settled by the owner.
**Starts when:** —
**Execution plan:** none — discovery; its output is unknown until the code is read.

- [x] 1.1 The spec, this plan and ADR-0185
- [x] 1.2 The usability reviewer agent, in the organisation's development plugin
- [x] 1.3 The mechanical search: every way a message is made, counted per file
- [x] 1.4 The recount: every message given a row (where, situation, kind, handler, change, confidence), by slice
- [x] 1.5 The merged map, with counts per handler, compared with the search
- [x] 1.6 The usability reviewer's check of the map
- [x] 1.7 The calls the reviewer could not settle, settled (by the lead, on the owner's instruction to run unattended; listed for the owner in the unit's report)

### Phase 2 — The shared pieces
**Delivers:** every handler has one piece to draw it, the guard refuses what is not allowed, and the builders have the
skill draft and the new *Messages* section.
**Starts when:** the map is settled (1.7).
**Execution plan:** none — one lane.

- [x] 2.1 The toast and the one place that draws it
- [x] 2.2 The nudge, in its three places, with a height test
- [x] 2.3 The frame line, in hq's frame
- [x] 2.4 One confirm dialog in place of the three
- [x] 2.5 The retry policy, `useBackgroundRead`, and hq's query default
- [x] 2.6 A required `kind` on `useAttentionWhen` and `ShowAttention`; `ReadFailure` as a nudge with `retry` required
- [x] 2.7 The design guard's new rules and the behaviour tests
- [x] 2.8 The skill's first draft, `.agents/skills/handling-errors/`
- [x] 2.9 `ui/DESIGN-SYSTEM.md` *Messages* rewritten

### Phase 3 — Every message on its handler
**Delivers:** every row of the map is built.
**Starts when:** the shared pieces have landed (2.1–2.9).
**Execution plan:** none — lanes, each from its rows of the map.

- [x] 3.1 hq conversations and voice: thread lines, "Not sent", voice spoken and in the thread, a re-read no longer an action error
- [x] 3.2 hq background reads: quiet retry, then a nudge in place or "Not up to date"
- [x] 3.3 hq sites that did not answer: the nudge on the thirteen screens and the storage pages
- [x] 3.4 hq frame: HQ not answering, read-only on the frame line, scheduled changes as notifications
- [x] 3.5 hq presses that failed: a `kind` on each, Try again where missing, toasts where the result is not shown
- [x] 3.6 hq browser dialogs: five `alert()` and three `confirm()` replaced
- [x] 3.7 `ui` screens and components: a `kind` on each, the timeline and session views
- [x] 3.8 console-web: polls on the quiet retry, `Notice` by kind, the confirm dialog
- [x] 3.9 The guide pages that describe a dialog that goes

### Phase 4 — Verify
**Delivers:** proof the build matches the map, and that nothing stops the person that should not.
**Starts when:** every phase 3 lane has landed and the lead's suites pass.
**Execution plan:** none — a check, by fresh agents and the reviewer.

- [x] 4.1 The second count: every map row checked on its handler in the code
- [x] 4.2 The mechanical search again: no message outside the map
- [x] 4.3 The usability reviewer's failure walk in the running app
- [x] 4.4 The owner's playtest — accepted on the report and the live walk instead (11 Nov); the owner walks the three checks the walk could not make afterwards

### Phase 5 — The skill, finished
**Delivers:** the next agent follows the rule without rediscovering it.
**Starts when:** the owner's playtest passes (4.4).
**Execution plan:** none — by hand.

- [x] 5.1 The skill finished from what passed
- [x] 5.2 `ui/DESIGN-SYSTEM.md` *Messages* matched to what was built

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1–2 | The shared pieces (phase 2) started while the recount ran, not after the map was settled | They do not depend on the map's rows; waiting would have cost a phase. What the map changed was sent to the lane while it ran |
| 1 | The map review settled ten rules (data before error, silent reads swept, final answers, re-reads after an action, the confirm's scope, a refused control's press, a field error only about the value, toasts only where nothing shows the result) and six situations; the spec's handler and situation tables were corrected in place | The reviews found rows the spec did not settle and two that would mislead the person (an empty list for a failed read; "Not sent" for a message that was sent) |
| 3 | The lanes followed the recount's slices (seven, by folder, in parallel) rather than the themed tasks 3.1–3.9; each slice carried the 3.x tasks for its folders | Folder lanes are file-disjoint, so all seven ran at once; themed lanes would have shared files |
| 3 | Each lane's usability gate was a code review; the making-it-fail check in the running app ran once over the finished build (4.3) | One running installation serves the walk; an hq per lane would have passed the machine's limit of five |
| 3 | The frame line takes a row of its own while it shows (it moves the content down once) rather than hanging over the screen | Hanging over the screen covered the call bar's Mute and End and some screens' own bars (C10) |
| 3 | A site that did not answer is not retried by any read in hq (`siteReadRetry` is the query default) | The spec says HQ already waited for the site; retrying a 503 delayed the nudge by about seven seconds |
| 4 | The second count found three rows built wrong and seven messages no row covered (one would have let Save wipe the risk rules); two fix lanes took them | The map missed them; the count is the check that found them |
| 4 | The failure walk found that opening a screen while HQ was away replaced the whole app with Wasp's error box (its wrapper of a signed-in page reads the person again on every page opening); fixed by never reading the signed-in person again on its own, and checked again with the walk's own scripts | Not caused by this unit, but it was the one way "HQ not answering" still stopped the person |
| 4–5 | The owner accepted the unit on the report and the live walk, without the playtest, so the next unit could start; the three checks the walk could not make (a real call ending, the real site stopped, Stop failing while a reply runs) are the owner's to walk afterwards | Time; every other case was walked in the running app |
| 5 | The skill and *Messages* were finished from what passed (the walk and the second count), before the owner's own walk | They describe the build as proved; anything the owner's walk finds is a new fix |
| 1–3 | No frame line in the Fleet Console | Its screens mostly do not need HQ, so decision 4's test for a frame line does not hold there |

## Closing note

Closed 11 November 2026. **Accepted by the owner** on the report and the usability reviewer's live failure walk; the
owner's own walk of three cases (a real call ending, the real site stopped, Stop failing while a reply runs) follows
as a separate check, and anything it finds is a new fix.

- **Open items**: 53 closed in the unit (each with its evidence in the triage); every Critical found along the way was
  fixed in the unit (six: an error box replacing the app while HQ was away, the risk rules that a failed read would let
  Save wipe, a sent message shown as not sent, "No projects yet" for a failed read, the Fleet Console blaming HQ for
  its own and Cloud's failures, and "not in this project" for a failed read). Deferred as their own issues:
  agenthix#229–#243 (15, none critical, none blocking a release) and one feature in the line's private planning (a cue
  sound when voice is about to end).
- **QA**: no full audit at this close (the owner's choice); the unit wrote scenarios SC-1929–SC-1946 and stories
  US-464–US-467, corrected seven scenarios and tagged their tests; they await the audit before release, which should
  also move the by-file tags onto single tests (agenthix#243).
- **Decision records**: ADR-0185 accepted at the start and implemented (its note added). Depends on: none. Revisits:
  none.
- **Also changed**: `ui/DESIGN-SYSTEM.md` *Messages*, `docs/concepts/notifications/notifications.md`, hq's
  `app-layout` skill, the guide's *Back up and upgrade*, and the new `handling-errors` skill. A usability-reviewer agent
  joined the organisation's development plugin.

