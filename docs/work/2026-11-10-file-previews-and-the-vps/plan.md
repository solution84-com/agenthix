---
name: File previews people can check their work with — plan
description: The phases of the file previews unit, as checkboxes, and the log of what changed.
created: 2026-11-10
---

# File previews people can check their work with — plan

## Goal

Every preview is something a person can check their work with, accepted by the owner at a walkthrough, and the build
is released and runs on a VPS for a week of use.

## Approach

**Designers review, the owner scopes, a builder fixes, in a bounded loop.** The previews are reviewed by designer
agents on a test installation built from `main`, never on the dev machine's servers.

1. **Review.** Designers capture every kind of file in every place and rate each finding (below). Their findings go to
   the owner on a dashboard.
2. **Scope.** The owner reviews the findings and approves a piece of work to fix them.
3. **Build.** A builder fixes the approved work; the images are rebuilt and the test installation upgraded.
4. **Review again**, at most twice in all. A second review is told what the first found and what was fixed. It checks
   those fixes, and looks for new Critical findings only where a fix changed something, or where something was missed
   that makes a preview unusable. It does not raise as Critical what the first review rated lower, and does not hunt
   for further improvements.
5. **The owner's walk**, after the second review and its build.
6. **One last build** for what the walk finds. Then the unit closes. No further review round.

**The ratings**, one per finding; between two, the higher, with the reason:

| Rating | Test | What happens |
|---|---|---|
| **Critical** | Unusable: a person can't tell from the preview whether the agent's work is right | Shown to the owner on a board; fixed in the unit |
| **Should fix** | Breaks the design guidelines (layout, spacing, colour, themes, a phone's width) or makes a task harder than it needs to be | Fixed in the unit; reaches the owner only if the fix changes how something works |
| **Minor** | An inconsistency most people would not notice while checking their work | Fixed if there is time; otherwise a backlog issue |

**Then the VPS**, deployed with the release from the closed unit, as the guide says a self-hoster would.

## Work breakdown

### Phase 1 — Review 1
- [x] Sample files of each kind, small and large, in a workspace and on a task
- [x] Two designers: the previews (each kind, at a desktop's and a phone's width, light and dark), and the places and
      states (the frame in each place, loading, too large, changed, failed, download)
- [x] The findings on a dashboard; the open preview issues triaged into it
- [x] The owner approves the work to fix

### Phase 2 — Build 1, review 2, build 2
- [x] Build 1: the approved fixes
- [x] Review 2: the fixes checked, bounded as above
- [x] Build 2: what review 2 found that the owner approves

### Phase 3 — The owner's walk and the last build
- [x] The owner walks every preview
- [x] The last build; the unit closes

### Phase 4 — The VPS
- ~~The machine, its domain and its files address~~ *(moved out of the unit: see Deviations)*
- ~~hq and its site installed from the released images, as the guide says~~ *(moved out of the unit: see Deviations)*
- ~~A conversation, a task, and a PDF, an image and a table opened through the relay on the VPS~~ *(moved out of the unit: see Deviations)*
- ~~What the deploy turned up, fixed or recorded~~ *(moved out of the unit: see Deviations)*

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | C5's fix became one file viewer for every place a file opens | The owner: a person previews a file to see it in full, and every place should open it the same way |
| 2 | Build 2 also read a Git workspace's files through the relay (site protocol 1.18, relay protocol 1.2) | Review 2 could look at a workspace with Git for the first time: pictures and PDFs didn't open there |
| 2 | The unit branch moved onto main after the one-key unit merged | The two units were built side by side and touch no common file |
| 2 | A design pass checked build 2 against the spec before the owner's walk, and its one Should fix and five Minor findings were fixed (with a recheck) | The owner asked that nothing Critical or Should fix reach the walk |
| 3 | The owner's walk found nothing to fix, so the last build had no work | The owner accepted the walk on 10 November 2026 |
| 4 | The VPS deploy leaves the unit: it runs after the release, as its own operational work | It installs the released images, and a release is cut from main after the unit merges, never inside a unit |

## Closing note (10 November 2026)

**Accepted** by the owner at their walk on 10 November 2026, with nothing to fix; the last build had no work.

**Open items.** Every item the reviews, the builds and the design pass recorded was checked against the code at the
close. None is critical, and nothing blocks a release.

- Closed in the unit: the six Critical findings of review 1 and the three of review 2, every Should fix, the Minor
  findings, the design pass's one Should fix and five Minor findings, and agenthix#77 and agenthix#80 (a hard-linked
  file has its own state, and the guide explains it).
- Already fixed on main before the unit, found while checking: agenthix#76, agenthix#84 (closed).
- Deferred, each its own issue: agenthix#208 (the line between the viewer and the chat), agenthix#209 (the PDF
  viewer's standard fonts and the page's content security policy), agenthix#210 (the commit on audit rows),
  agenthix#211 (Back in the workspace view), agenthix#212 (Back from a task's missing-file view), agenthix#213 (a
  container test for a file at a commit), agenthix#214 (an end-to-end test that depends on the Library's state). agenthix#132 and agenthix#156 stay open for what remains of each. Two ideas
  for later are queued with the maintainers.
- Settled by the owner at the close: anyone who may read a workspace may read any commit of its own repository
  (`docs/architecture/files-and-relays.md`, *Who may read a commit*).

**QA.** The unit wrote its QA contract (scenarios SC-1869 to SC-1899, stories US-450 to US-455, and the scenarios it made
untrue corrected) and tagged the tests that cover them. No QA audit ran at the close; these entries await the audit
before the release.

**Regression.** Every module's typecheck and unit suites, both integration suites, the cross-app suite as shipped and with every flag on, the host and site container suites, hq's end-to-end suites as shipped and with every flag on, the image start tests and the install test pass on the regrouped branch's code. The integration suite found the open and facts tests' channel stand-in missing the site-version check's lookup; fixed in the tests. One end-to-end test fails on a used development database for a reason outside the unit (agenthix#214); four others that failed once passed on a rerun.

**Records.** Implementation notes on ADR-0128, ADR-0153 and ADR-0155; no record was created, superseded or left
Proposed. The user guide, the architecture and the concepts documents describe the code as built.

**Phase 4, the VPS**, left the unit (see Deviations): it installs the release cut from main after this merge.
