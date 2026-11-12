---
created: 2026-11-11
description: A live demo of hq that people move around in without installing anything, so they know at once whether Agenthix is for them; every model call and agent run is scripted.
---

# A live demo of hq

An **initiative**. People who find Agenthix should be able to try it at once, in their browser, without downloading or
installing it, and judge from the features and the experience whether it is for them. A demo hq and its site run on
one machine, seeded with a sample organisation. No real model is called and no agent container starts: talking to an
agent, voice and task runs are scripted so they look and feel real.

**It covers:**

- **Scripted agents**: the conversation lead's model in hq and the agent runtime on the site replaced by scripts, with
  everything between them the real code.
- **A demo voice**: lines recorded once, the visitor's side tapped rather than spoken.
- **A demo seed**: the user guide's sample organisation, dated from today and extended so every screen has something
  to show.
- **Getting in and the guard**: an account per visitor from one button, a member who views the sample and works in
  their own space, and a short guard for what a member could still do that a public demo must not.
- **The reset**: every 6 hours, with a countdown.
- **A demo setting** of the install, `DEMO_MODE`, that turns all of this on; `agenthix install --demo`.

**Closed** 12 November 2026 ([closing note](plan.md#closing-note)).

**It holds** [`spec.md`](spec.md) (today and the design), [`plan.md`](plan.md) and the gitignored `execution/`.

**It follows** [kinds of error message](../2026-11-11-error-message-kinds/), whose message rules the guard's refusals
use, and [a softer, more polished design system](../2026-11-10-design-system-polish/README.md), so the demo shows the
polished look.
