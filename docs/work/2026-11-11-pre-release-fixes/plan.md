---
name: Pre-release fixes — plan
description: The changes of the pre-release fixes unit.
created: 2026-11-11
---

# Pre-release fixes — plan

## Goal

Before the release: a contributor signs the CLA before their first pull request merges, the guide's screenshots travel
with each release and the README shows them, the thread follows each kind of reply as it should, a call says what the
agent is doing, and Inworld's language models need no feature flag.

## Approach

One fix branch, `fix/pre-release-fixes`, from main after the design system unit merged, one commit per change, in the order below. Scoped
tests per change (`testing-a-change`). Changes 1 and 2 change no screen. Change 3 does: each one's design goes on a
board for the owner first, then the build, a designer's check, and the owner's playtest.

## Work breakdown

### 1. Contributors sign the CLA
- [x] A CLA check on pull requests, our own workflow on GitHub's own actions (`.github/workflows/cla.yml`,
      `scripts/cla/`): a contributor agrees once by replying with a sentence, the agreement is recorded on the
      `cla-signatures` branch, and the check passes on their later pull requests. Bots and maintainers are not asked.
      It never checks out or runs a pull request's code
- [x] `docs/CONTRIBUTING.md`, the pull-request template and `CLA.md` say exactly how to agree
- [x] The organisation version: the check is per person; once an organisation agrees, a maintainer records the people
      it names
- [ ] After the push: the check made required in the branch settings, and one pull request from an account that is not
      a maintainer

### 2. The guide's screenshots are release assets, and the README shows them
- [x] The guide's pages and the README name each screenshot by the release that holds it:
      `https://github.com/solution84-com/agenthix/releases/download/<tag>/<name>.png`, in place of `screenshot:<name>`,
      so the pictures show on github.com, and each version's pages show that version's pictures. The name check reads
      the name from the address. The website and the Fleet Console's Help show the address as it is: no swapping
- [x] A scripted step while preparing a release, before it is proved: capture the screenshots on the commit to be
      released, compare them with the last release's, and point every link to a new or changed screenshot at the
      upcoming tag; unchanged ones keep the release that holds them. It commits the edit, and the release proves and tags
      that commit. Run again if a screen changes before the tag
- [x] Each release carries only its new and changed screenshots, as assets of its GitHub Release, attached by *Publish
      release* (`publish-images.yml`) from the release build's set for the tag. Nothing is started by hand and no storage
      key is needed. A link names a tag before it is published, so a release keeps the version it was prepared for (a
      failed attempt is tagged again with the same version, as the release steps already say)
- [x] The comparison (`hq/scripts/guide/compare.mjs`) reads each screenshot from the release the pages name for it
- [ ] The manual publishing workflow (`publish-guide-screenshots.yml`) and its storage secrets go; agenthix#35 is
      closed as no longer needed; the release steps (`docs/guide/README.md` and the `releasing` skill) gain the step
- [x] The README: a picture at the top and "What you can do", one screenshot and one line per main feature, each linking
      to its guide page; voice in place of workflows. Its links are kept by the same step
- [x] `AGENTS.md`'s code conventions: a binary the source needs (to build, run or test) is committed, kept small and
      added rather than replaced; a binary a release produces (screenshots, recordings, builds) is that release's asset
      and never committed

### 3. The thread follows each kind of reply as it should (agenthix#228, blocks 0.1.0)
- [x] A board: the room comes with a reply, and the reply's buttons take it up as they appear (option 1, owner 11 Nov)
- [x] The first build, in the follow (`ThreadMessages.tsx`, `useThreadFollow.ts`, `threadScroll.ts`), with tests first
- [x] The owner's playtest of it: typed replies felt jittery, scrolling was hard to manage, and scrolling down left a
      large empty space; voice was fine but jittery while following
- [x] A browser harness (`hq/e2e/harness`) that streams a scripted reply, typed or spoken, and records the scroll on
      every frame; with it the first build's jitter and empty space were measured and their causes found
- [x] Voice and typed treated apart, worked through with the owner one playtest at a time:
  - Sending holds the person's message at the top with room under it, even after scrolling away; their own scroll lets
    go of the hold
  - Typed: the reply is written under the held message and never followed; "writing" no longer shows on the line above
    the box; the round button shows the typing dots while writing is out of sight, and keeps up with it once pressed
  - Voice: the person's words are held as they speak; the reply is followed a line at a time, still while each line is
    spoken; ending voice, or the stored reply replacing the stream, moves nothing
  - A reply's buttons wait for its reveal and take the room left for them, so nothing moves at its end; a reply keeps
    the kind it started as, so switching between typed and voice moves nothing
- [x] The QA contract (SC-1916 to SC-1919, SC-1923, SC-1005; AC-461a, AC-461b) and the guide's reading line

### 4. A call says what the agent is doing
- [x] A board, settled with the owner: the line above the message box carries
      the state in a call, an icon then words, the icon always in one place — connecting (a turning ring), listening
      (still bars), thinking (the travelling dots, as today), speaking (the bars moving), reconnecting (a dashed ring);
      mute is shown by its own button; no colour for any state
- [x] Built (`VoiceLine.tsx`, `voiceUi.ts`), in the thread and the voice bar on other pages; the coloured glow and the
      rings go; the line lines up with the text in the box, out of a call too
- [x] Short sounds made in the browser (`voiceSounds.ts`): voice on once ready and when a connection is back, voice off,
      mute and unmute, a lost connection; none while the agent speaks; the person's **Voice sounds** setting turns them
      off (a new column, client protocol 1.21)
- [x] The QA contract (SC-1927, SC-1928, SC-1001, SC-1007; AC-325l) and the guide's voice and settings pages

### 5. Inworld's language models without a feature flag
- [x] The `inworldLanguageModels` flag goes (`core/src/shared/featureFlags.ts`, `hq/src/shared/features.ts`): Inworld is
      a provider of language models as well as speech, always. Every gate goes with it (`core/src/providers/providers.ts`,
      hq's providers, routing and model list refresh, the site's runtime and model relay), and the tests of the off path
- [x] The documents that say it is behind the flag follow: ADR-0183's implementation note, `docs/concepts/providers/`,
      and the QA contract (`docs/qa/scenarios/hq.md` and `site.md`, `docs/qa/coverage.md`), whose scenarios behind the
      flag become ordinary ones
- [x] Ran after change 3: both change `docs/qa/scenarios/hq.md`

## Deviations

| Change | What changed | Why |
|---|---|---|
| — | A call's buttons in the message box, the chat panel's one button, a reply's words fading in, and messages never in the content moved out, to the design system polish unit (`docs/work/2026-11-10-design-system-polish/`, phase 4); the README is now change 2 | The owner moved them there (10 Nov): they are design calls, and that unit is the design focus |
| — | Added change 3, agenthix#228 (the room left under a conversation at rest) | The owner (11 Nov): a pre-release fix that blocks 0.1.0, found at the design system unit's last playtest |
| — | Added change 4, kinds of error message and a strategy for error handling | The owner (11 Nov): it blocks 0.1.0, and this unit holds everything that goes before the release |
| 2 | The screenshots moved from the website's storage to each release's assets; the guide and the README link them by the release that holds them, rewritten while preparing a release, and a release carries only what changed | The owner (11 Nov): they are what a release produces, so they belong to it, and each version's pages should show that version's pictures, on github.com too. Release assets are GitHub's way to distribute them, free, with no total limit |
| — | Added change 4, the avatars and covers as a content pack | The owner (11 Nov): more avatars and covers are coming, and they should arrive without being committed or fetched while hq runs |
| 1 | Our own CLA workflow, not CLA Assistant's action | The owner (11 Nov): the action is archived, and a small workflow on GitHub's own actions keeps the agreements in this repository |
| — | Kinds of error message and a strategy for error handling moved out, to a unit of its own that follows this one (it still blocks 0.1.0); the content pack is now change 4 | The owner (11 Nov): the investigation found about 160 messages changing kind and 314 files holding a message, across hq, ui and the Fleet Console — the scale of a unit, not a fix |
| — | Added change 5, Inworld's language models without a feature flag | The owner (11 Nov): making the marketing video, the onboarding showed a flag for Inworld; Inworld is the default and should not be behind one |
| — | Avatars and covers moved out, to a unit of their own that follows this one (generated avatars and covers); the Inworld change is now change 4 | The owner (11 Nov): the content pack gave way to avatars and covers generated in hq's own code and customisable part by part, which changes how every picture is made and needs proper thinking |
| 3 | Typed replies lost the three-line reading room: one line of room under the last line; a browser harness measures the follow frame by frame; the agent's avatar in the voice reading room to follow | The owner's playtest (11 Nov): the first build was jittery, fought scrolling, and left a large empty space |
| 3 | Typed and voice treated apart: sending holds the person's message at the top; a typed reply is never followed; voice follows a line at a time. The rework's continuous glide was replaced | The owner's playtests (11 Nov): the glide read as rolling credits, which the owner had ruled out; one rule for both modes kept causing one problem with another |
| 3 | Kernel's avatar in the voice reading room dropped | The owner (11 Nov): the agent's picture as a speaker was tried on the voice line and did not work out |
| — | Added change 4, a call says what the agent is doing, with its sounds and setting; Inworld is now change 5 | The owner (11 Nov): the green and blue glow and rings were a poor way to show who is talking |

## Closing (11 Nov)

All five changes are built and on the unit's branch, merged to `main` locally, not pushed. Tested on the branch: the
typecheck of hq, core and the harness; hq's and core's unit suites; the thread harness in Chromium, Firefox and WebKit.

**The full regression is deferred** (owner, 11 Nov): the integration and cross-app suites, and building and starting
every image, run once over this unit and the next few, **before anything is pushed**, and their failures are fixed
then. Most likely to need it: the new `voiceSounds` column and its migration, and the client protocol at 1.21.

**At the push:**
- agenthix#228 is closed as fixed, and agenthix#35 as no longer needed.
- The owner makes *Contributor licence agreement* a required check, and one pull request from an account that is not a
  maintainer proves it.
- The owner deletes the storage secrets, variable and environment the removed publishing workflow used.

**Follow-ups:** a voice screenshot recipe for the README's "Talk to your agents" card; closing a speech connection
still opening when voice stops, and passing the stop signal into the server's text-to-speech stream (seen when voice
was toggled quickly).
