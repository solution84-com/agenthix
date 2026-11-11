---
created: 2026-11-11
description: The changes before the release — contributors sign the CLA, the guide's screenshots travel with each release, the thread follows each kind of reply as it should, a call says what the agent is doing, and Inworld's language models need no feature flag.
---

# Pre-release fixes

An **operational** unit: the separate changes that go before the release, on one fix branch.

**It covers:**

- **Contributors sign the CLA.** `CLA.md` exists and `docs/CONTRIBUTING.md` and the pull-request template promise
  "a check on your first pull request asks you to agree", but nothing in the repository runs that check. A CLA check
  is added, and the wording matched to how signing works.
- **The guide's screenshots travel with each release, and the README shows them.** Each release carries its new and
  changed screenshots as assets of its GitHub Release, the pages link each by the release that holds it, and the README gets a picture at the top and a "What you can do" section with a
  screenshot per feature, in the manner of [VoiceStudio's README](https://github.com/debpalash/voicestudio). No
  screenshot is committed.
- **The thread follows each kind of reply as it should** ([agenthix#228](https://github.com/solution84-com/agenthix/issues/228),
  which blocks 0.1.0). It began as the room left under a conversation at rest; the owner's playtests found the follow
  jittery and the space under it too large, and the two modes were then treated apart. Sending holds the person's
  message at the top with room under it; a typed reply is written there and never followed, with the round button
  showing the typing dots while writing is out of sight; in voice the person's words are held as they speak and the
  reply is followed a line at a time. A conversation at rest sits just above the box, and nothing moves at a reply's end.
- **A call says what the agent is doing.** The line above the message box carries the state in a call (connecting,
  listening, thinking, speaking, reconnecting) as an icon and words, in place of the coloured glow and rings, with a
  few short sounds and a setting to turn them off.
- **Inworld's language models without a feature flag.** Inworld is the default provider of models as well as speech,
  so the `inworldLanguageModels` flag and its gates go.

A call's buttons in the message box, the chat panel's one button, a reply's words fading in, and messages never in
the content were first queued here and moved to the design system polish unit (owner, 10 Nov), as design calls; that
unit built them. Avatars and covers were added here as a content pack on 11 Nov and moved out the same day to a
unit of their own, generated avatars and covers. Kinds of error message and a strategy for error handling were added here on 11 Nov and moved out
the same day to a unit of their own, which follows this one: the investigation showed the scale of a unit.

**It holds** [`plan.md`](plan.md).

**It follows** [a softer, more polished design system](../2026-11-10-design-system-polish/README.md), merged on 11 Nov,
so the README's pictures show the new look.
