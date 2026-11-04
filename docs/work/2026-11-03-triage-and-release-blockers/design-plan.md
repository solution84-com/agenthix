# Triage and release blockers — design pass plan

The whole platform's user experience, made tight with the owner before the early access release 0.1.0. Nothing is off
the table; the work is ordered by priority, the most complex areas first. It is its own plan beside the triage plan
(`plan.md`): the triage fixes what is broken or unsafe; this pass decides how the screens should look and work, and
builds that.

**It is the triage's phase 3, as polish.** It starts once the triage's fixes have landed (its phases 1 and 2), so the
security and bug fixes have stopped moving screens around, and finishes before the review of the hard items, the
proofs on real machines, the readiness check and the close.

## Approach

- **One area at a time, walked with the owner.** Each area is a group of screens a person uses together. The lead
  prepares its boards from the screens as built, the open findings and the area's design notes; the owner walks them.
- **Boards show today, then each change.** Each area starts with a *Today* board (the screens as built, each element
  numbered), then one board per change: *Before*, *After* and *Why* side by side. A new element says "New — nothing
  today".
- **Design first, questions last.** The lead proposes the whole area with a default for every choice; the owner
  reviews it, then answers what is left.
- **Settled boards become the build's baseline**, committed under `boards/<area>/`. The build goes feature by feature,
  shared components first, in lanes, and ends with the owner walking the built screens.
- **Feedback is High impact**, as the triage design defines it: it ranks after Security and Critical, and is never cut.
  Layout or look findings from any other walk join the matching area here.
- **Functionality stays where it is.** This pass changes how screens look, read and are laid out, and what is shown
  first; it does not change what the product does. A change of behaviour found here is raised with the owner first.

## Areas, in priority order

The pass covers every screen of HQ and the Fleet Console. It starts with the three areas known to be the most complex,
then takes the rest in the order that matters most to a new person getting through: setting up a new HQ, onboarding a
member, a first conversation and a first task, then everything else. The lead proposes that order, with what is known
about each area, when the pass starts; the owner sets it.

### 1. The workspace view

The full-screen view where people review and merge code work: Files, Git, the branch select, the conversation, and
*About*. Its layout was set aside for this pass when code work on branches shipped.

### 2. The skills screens

The Library list, an asset's page, the editor, adding a skill, rolling back, and a place's Skills page and Your space.
Inputs: the skills unit's `design-state.md`.

### 3. Workflows and GitHub set-up

Connecting GitHub, accounts, starters, approvals, secrets and variables: working, but too much at once for a first-time
person. The aim is sensible defaults with the advanced parts out of the way until needed.

### 4. The rest of the platform

Every other screen, in the order set at the start of the pass: setting up a new HQ, onboarding, conversations, tasks
and projects, agents and their permissions, places and files, settings, and the Fleet Console.

## Each area's shape

1. **Prepare:** the *Today* board and the findings, numbered.
2. **Walk with the owner:** the change boards, decided one by one.
3. **Baseline:** the settled boards committed under `boards/<area>/`.
4. **Build:** in lanes, feature by feature.
5. **Accept:** the owner walks the built screens; fixes until accepted. The area's design-pass issue closes then.

## Close

Each area leaves a `design-state.md` beside its boards: what was decided, what changed while building and why, and what
is left for later. The design pass is done when the owner has accepted every area.
