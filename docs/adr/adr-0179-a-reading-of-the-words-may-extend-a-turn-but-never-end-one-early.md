---
created: 2026-11-08
description: Whether a person has finished their thought is judged by the conversation model as it begins to answer, and only to hold a turn open past the sound-based rule. It calls a keep_listening tool when they have not finished; it never ends a turn sooner than the sound rule, and when the judgement is late or fails the sound rule applies.
---

# ADR-0179: A Reading of the Words May Extend a Turn but Never End One Early

**Status:** Accepted

## Context

The end of a person's turn is decided by sound alone: a small audio model scores whether the last seconds sound finished,
and a fixed silence ends the turn whatever it scored. It does not read the words, so a person who thinks aloud and pauses
is answered mid-thought. Reading the words can tell a finished sentence from a thought still forming, but a wrong reading
costs something either way: a turn cut, or a person who had finished made to wait.

## Options considered

**A patience setting alone.** Rejected as the whole answer: it makes a person who has finished wait as long as one who has not.

**A separate model call to judge every turn.** Rejected: a second call in a pause window that is already tight, on every
pause, and with less of the conversation than the agent's own model has.

**A reading that may also end a turn early.** Rejected: a wrong early end is the failure being fixed, and it cannot be
taken back.

**A decision the model writes in front of every reply** (a JSON line, then labelled lines, then tags). Built and tested over
versions 24 to 32. Rejected: the reply could not stream until the form was read, the form needed detecting and parsing, and
every finished turn paid for it.

## Decision

**The conversation model judges, as it begins to answer a spoken message, whether the person has finished. If not, it calls
a tool, `keep_listening`, with a short reason and writes nothing; if so, it replies.** The turn is held: nothing is said, and
the person's next words join the same message. The tool can only hold a turn open, never end one sooner than the sound rule.

- The judgement is the way a listener would make it: would they expect an answer now, or are they still working out what to
  say? Signs of an unfinished thought are examples, not a checklist.
- When the call is late or fails, the sound-based rule applies as it does without it.
- The tool's reason is logged and never acted on, so flaws in the judgement can be found.

## What this binds

- Any later reading of meaning in turn-taking may extend, not end early, and falls back to the sound-based rule.
- Undoing the rule means a wrong reading can cut a person off.

## Consequences

### Positive
- A person who thinks aloud is not answered mid-thought, and a finished reply streams from its first word.
- A wrong reading costs a wait, never a cut-off.

### Negative
- A person who had finished, and was read as still thinking, waits for the reply until they speak again.
- A finished turn carries no stated judgement, so a model could answer a hesitation; this is measured, not assumed away.

### Risks
- In testing the model sometimes answered a hesitation instead of holding (about 1 turn in 30 on the ambiguous item) or described
  the hold in words instead of calling the tool. The first is accepted and watched; the second would be spoken, and hq stops text
  written before the call.

Implemented by the voice unit (merged 9 Nov 2026): `keep_listening` and the reading of a model's stream are in `hq/src/conversations/lead/voiceLogic.ts`, used by the real turn (`coordinator/turn.ts`) and by the voice playground; a held turn is sent to the holder as `conversationVoice:turnHeld` (client protocol 1.19) and the person's next words join the same message. The playground's scenario runner measures the hold on 29 trailing-off scenarios.

## References

- adr-0178 — a spoken acknowledgement never answers the request
- adr-0181 — the conversation model decides the voice turn in its own call
