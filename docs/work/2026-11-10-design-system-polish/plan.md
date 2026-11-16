---
name: A softer, more polished design system — plan
description: The phases of the design system polish unit.
created: 2026-11-10
---

# A softer, more polished design system — plan

## Goal

Dark and light mode feel as soft and finished as the reference products, through the design tokens and the
design-system rules, with every component in hq and `@agenthix/ui` brought onto them.

## Approach

A designer reviewed representative screens against the references and proposed token-level changes, shown before and
after by overriding the tokens in the browser, with no code changed. The owner approved them on the boards.

The build runs in lanes. The foundation goes first, alone: the tokens, the shared primitives that carry each state, and
the rules in `ui/DESIGN-SYSTEM.md`. Every other lane builds on it. Then the sweep: one lane per area of the code, the
areas disjoint, each bringing every component in its area onto the primitives and rules. The lanes merge one at a time.

Then the design review, a designer independent of the builders, in at most two rounds, each followed by a fix lane.
Each round is two checks:

- **The code**: every component read against the design system — buttons and their hover, pressed, focus and disabled
  states; selection (segmented choices, chosen rows, things switched on, chosen cards); fields and their focus;
  clickable cards; menus and pickers; where the accent is used; radii and type. Anything still drawing a state its own
  way is a finding.
- **The screens**: the screens the change reaches, in light and dark, at desktop and phone width, against the boards.

Round 2 checks each fix from round 1 and looks for anything still off the system. A test that refuses the retired
patterns keeps them from coming back. Then the owner walks it, one last build follows, and the unit closes.

## Work breakdown

### Phase 1 — Review and proposal
- [x] Three screens, dark and light, before; the diagnosis
- [x] The proposal as token values, with after screenshots of the same screens
- [x] The owner chooses

### Phase 2 — The foundation
- [x] The tokens in both modes: the neutral surfaces, borders and text, the new field, link, popover, pressed, segment,
  card-hover and shadow tokens, the accent, the selected fill, radii and the type scale; values for the new tokens in
  the Fleet Console's palette
- [x] `hq/src/Main.css`'s text-input rule on the field tokens
- [x] The primitives that carry each state: the fields (`Input`, `Select`, `Textarea`, `InlineEdit`, `NativeSelect`,
  `SearchField`, `FilterSelect`, `DateField`, `TimeField`); `Button` (hover, pressed, keyboard focus, disabled);
  `FOCUS_RING`; a shared segmented control; a chosen row in a menu or list; a switch; a clickable card and a chosen
  card; menus raised by tone
- [x] `ui/DESIGN-SYSTEM.md`: surfaces and depth, fields, the accent's three uses, selection and interaction states,
  pickers inside a menu, a failure card, radii and type

### Phase 3 — The sweep
- [x] Every component in `@agenthix/ui` and hq onto the primitives and rules: grey fields, fields' focus, segmented
  choices, chosen rows, switches, disabled at 40 %, clickable and chosen cards, the accent only on the main button,
  links and things switched on, breadcrumbs and file chips in text tones, menus and their pickers, the composer, the
  failure card, headings at 500, message text at a whole 15 px
- [x] A test that refuses the retired patterns (indigo selection, accent-tinted choices, a field's accent focus, other
  disabled opacities)

### Phase 4 — Design review and fixes
- [x] Review 1: the code and the screens, one rated list
- [x] The fixes from review 1
- [x] Review 2: each fix checked, and anything still off the system
- [x] The fixes from review 2
- [x] The chat panel's state as one button in the bar (open and minimise, as ⌘J), with "Over the page" at the top of
  the conversation's ⋯ menu
- [x] Messages never in the content: a full scan of inline messages, then each moved to a centred dialog, the control
  that refuses (greyed, why in its tooltip), or nothing; a form field's own error stays
- [x] A reply's words revealed as they appear: one eased position, 600 ms ahead of the voice, letters fading in, one
  mechanism for typed and voice, off under reduced motion; the thread follows the revealed line a line at a time, 3
  lines above the box
- [x] A call's buttons inside the message box: Mute in the dictate slot, a round End where Start voice was, the same
  pair in the call bar
- [x] A voice reply keeps only what was heard, cut at the last word, when the person talks over it or ends the call;
  End is a cross
- [x] The owner's walk and the last build

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 2–4 | Phase 2 (apply) became a foundation, a sweep, and a design review of the code and the screens | The owner asked for the review to check the code, so that every component's buttons, states and selection come onto the system |
| 2 | Dark `accent-hover` #6b6ef0 → #4e51e0 and `accent-press` #4a4dd8 → #4447d6; dark `field-focus` #6b6b6b → #7a7a7a | The approved values failed the contrast rules: white on the hovered button 4.11:1 (under 4.5), the focused field's edge 2.69:1 (under 3). The spec's "a deeper indigo" on hover now holds too |
| 2 | The Fleet Console keeps its own radii, line heights and shadows | Its palette is out of this unit; only the shared primitives' states reach it |
| 4 | The chat panel's three-button control became one button, "Over the page" moved into the ⋯ menu | The owner moved it here from the pre-release fixes, as a design change made while this unit was open |
| 4 | Messages never in the content, with a full scan | The owner moved it here from the pre-release fixes (10 Nov): an error under the message box pushed it up |
| 4 | A reply's words fade in | The owner moved it here from the pre-release fixes (10 Nov) |
| 4 | A call's buttons inside the message box | The owner moved it here from the pre-release fixes (10 Nov) |
| 4 | The fade became a reveal: one eased position, letters fading in, 600 ms ahead of the voice; a per-word fade and a left-to-right mask were each built and replaced | The owner's walk (11 Nov): the fade did not show, then read word by word and lagged the voice; the eased reveal was chosen on a design board with the real voice |
| 4 | The thread follows the revealed line, held 3 lines above the box, easing a line at a time; only the person scrolling up lets go; the same in typed chat and voice | The owner's walk (11 Nov): a long spoken reply ran under the box. A slow continuous drift was tried and rejected ("hard to follow in a story"); a grey read-ahead was tried and rejected ("takes me out of the conversation") |
| 4 | A voice reply keeps only what was heard, to the last word, when the person talks over it or presses End; the client protocol moves to 1.20 (`heardWords`) | The owner's walk (11 Nov): End kept the unsaid words, and talking over a reply cut only at whole sentences |
| 4 | End is a cross, not a handset | The owner (11 Nov): to tell it from the stop button in typed chat |
| 4 | The person's live words in a call are their ordinary grey bubble, shared with the voice playground; the thread's scroll bar is always shown | The owner's playtest (11 Nov) |

## Closing note

Closed 11 Nov 2026. The owner accepted the work after the last playtest: "the voices now pass, and the design work
comes to an end."

**Open items:** the close triage checked 129 items against the code. 107 were already closed. These were fixed in the
close: the tests that still expected messages in the page, and clickable rows the keyboard could not reach. The rest are
deferred as issues:

- **Release blockers for agenthix@v0.1.0:**
  - agenthix#228: a conversation at rest keeps a large space above the message box;
  - an error-handling strategy, tracked outside this repository as a unit of its own: error messages need kinds, a
    hard alert as a dialog and a soft nudge in the page.
- **agenthix:**
  - Bug: #215, #216, #219, #220
  - Debt: #217, #222, #223, #224, #225, #226, #227
  - Chore: #218, #221
  - Comment on the existing #196: the speaker adapter has grown.
- **Tracked outside this repository:**
  - four product decisions: a spoken acknowledgement for a hard stop, code blocks and cards following the reveal,
    greying controls while HQ is read-only, and Home's empty sections;
  - the mobile app sending `heardWords`;
  - the copies of the design tokens kept by the mobile app and the website.

**Regression:** the full regression ran at the close, required because the client protocol moved to 1.20.
- Every module's typecheck, unit and integration suite passes.
- The cross-app suites pass, as shipped and with every flag on.
- hq's end-to-end suites pass, including the not-secure project and every flag on. The specs that need an Execution
  Site were rerun with the dev site paired, and passed (39 passed, 13 skipped for unset seed variables).
- The image start test passes for all 8 images, and the install test passes.
- Flaky under load, passing alone: host `hqMove`, and the cross-app `10-propose-skill`.
- One e2e spec fails on the dev data, not the code: `library.spec.ts` SC-1638, because every team template has an update
  waiting.

The close also fixed a real defect: three not-found pages said HQ had not answered.

**QA:** the unit's contract is written: stories US-456 to US-463 and scenarios SC-1900 to SC-1922. The scenarios it
made untrue are corrected in place, SC-222 is retired, and the tests that cover them are tagged. The only scenario
without a test is SC-1920, the always-shown scroll bar, which is CSS only.

No QA audit ran. The scenarios await the audit before release, which should also check:
- AC-146d, which has no scenario since SC-222 was retired;
- the older scenarios the message lanes may have made stale, against the unit's scan of messages;
- `docs/qa/coverage.md`.

**Decision records:** none created or changed. The unit's rules live in `ui/DESIGN-SYSTEM.md` and the spec.

**Lesson:** a unit on something every repository shares should stay small and close fast. This one took in the chat
panel, messages, the reveal, heard-only voice and the follow, and it held up related work in other repositories.
