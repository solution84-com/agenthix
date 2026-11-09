---
created: 2026-11-08
description: What an agent says aloud to acknowledge a reply that will take a while is one short opening sentence of its own reply. It may say only that the request is being looked into. It never answers, solves, explains or states a result, plan or fact, never says the work is done, and never speaks for the person.
---

# ADR-0178: A Spoken Acknowledgement Never Answers the Request

**Status:** Accepted

## Context

While the agent's own model works out a reply that needs real work, the person hears either nothing or a stored phrase that
says nothing about the conversation and, over a long conversation, repeats. A line that fits what was said would sound like
an agent that is following. It is spoken in the agent's voice, so a wrong claim is the agent's claim, and a spoken line that
arrives before the real reply can contradict it with nothing to take it back.

## Options considered

**Stored phrases only, and more of them.** Rejected: a phrase made ahead of time cannot know what was said, and the
repetition is the problem.

**A short call to a small fast model that writes the line.** Built, tested over 23 prompt versions and measured. It worked
(it held the safe line in most cases) but it saw only two turns, it added a second call with its own keys, model list and
organisation setting, and it had to be fenced against answering, because a cheaper model given a question tends to answer it.
Replaced by the next option; see ADR-0181.

**The agent's own model opens its reply with the sentence** (chosen). It has the whole conversation and its tools, it knows
whether the reply will take real work, and the sentence streams with the reply.

## Decision

**The acknowledgement is the first sentence of the agent's own reply, written only when the reply needs real work
(background work, several steps, or a long answer).** It says only that the request is being looked into and names it in a few
words. It never answers, solves, explains or starts the request, never states a result, a plan or a fact about the work, never
says the work is done, and never speaks for the person. When the reply can be given straight away, there is no acknowledgement.

- The model that writes the reply is responsible for this and for not repeating itself, as for every reply; there is no
  separate check on the sentence. It is tested against requests the model is tempted to answer.
- When the call fails, or no reply has started after a generous ceiling, a stored standard acknowledgement covers the wait.

## What this binds

- Any later spoken acknowledgement, whatever writes it, follows the same limit. Undoing it means a wrong spoken claim can
  precede the real reply.
- It is part of the lead's own call, costed like every lead turn (adr-0139), not a separate call or bill.

## Consequences

### Positive
- The acknowledgement is fitted to the whole conversation and comes only when the wait is real.
- No second model, no extra setting.

### Negative
- The only guard against a sentence that answers is the model's own wording and the tests; a missed one is spoken.

### Risks
- A model that opens with a sentence and then does not make the call (it says "I have set the reminder" and calls nothing) was
  seen in testing and reduced by telling the model to make the call in the same step; it is to be watched after release.

Implemented by the voice unit (merged 9 Nov 2026): the voice turn block the lead is sent for a spoken message (`hq/src/conversations/lead/voiceTurnBlock.ts`) tells it to open with one short sentence only when the reply needs real work, and the stored standard acknowledgement plays once at about four seconds when nothing has started (`hq/src/conversations/voiceClient/adapters/standardAcknowledgement.ts`). The voice playground's scenario runner tests the opening against 20 tasks and 20 quick questions.

## References

- adr-0125 — voice is a mode of the conversation
- adr-0139 — one resolver chooses every model and voice call
- adr-0181 — the conversation model decides the voice turn in its own call
