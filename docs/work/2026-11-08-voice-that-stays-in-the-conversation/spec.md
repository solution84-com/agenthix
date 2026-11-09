---
created: 2026-11-08
description: What voice does today for hearing, for filling the wait and for listening, why the agent feels disconnected and repeats itself, and the design the owner decided on 8 and 9 Nov 2026: the conversation model's own call decides whether a thought is finished and opens a slow reply with a short acknowledgement, one listening family of stored clips, Inworld as the default way to hear, and one setting, each person's Adaptive voice.
---

# Voice that stays in the conversation — spec

**Status:** Design decided by the owner on 8 Nov 2026 and written here the same day. Nothing is built. The owner reads
this amended spec before any lane starts. The numbers in it (gaps, waits, pool sizes, the length of the conversation the
short call reads) are first values, held as settings so they can move while the owner talks to it.

## Why

After talking to an agent by voice for a while, two things stand out.

1. **The agent feels disconnected.** While its own model works out a reply, what the person hears is a stored phrase
   ("Okay, bear with me."), or a quiet listening sound, that says nothing about the conversation. After a few minutes
   the same few phrases come round again: only 15 wait phrases, 5 listening words and 3 encouragement phrases exist per
   voice, and the listening words avoid only the one just said. The agent sounds like it is not following.
2. **It cuts a thinker off.** The end of a turn is decided by sound alone, and 3 seconds of silence ends it. A person
   who thinks aloud ("what if… what's this… what's that…") is answered mid-thought.
3. **Voice asks for two vendor accounts** beyond the model provider: one to hear people and one to speak. A new hosted
   setup asks for three keys before an agent can talk. Each extra account is a place people stop.

Voice is one of the main ways into the product, so all three are worth fixing before the first release is cut.

## What is there today

Checked in the code on 8 Nov 2026 (branch `feature/triage-and-release-blockers`):

| Part | What it does | Where |
|---|---|---|
| **Hearing** | The browser streams the microphone to AssemblyAI with a short-lived token hq mints for the organisation's account; the words come back interim and final | `hq/src/voice/speechTokenAction.ts`, `conversations/voiceClient/adapters/assemblyAi.ts`, `voiceClient/stt/` |
| **Speaking** | The reply streams from the lead's model, sentence by sentence, each sent to Inworld text to speech; audio reaches the browser tagged with the reply's id | `conversations/voice/speech.ts`, `outbound.ts`, `voice/inworldAdapter.ts` |
| **End of a turn** | A small audio model listens to the last 8 s of the person's audio, 0.2 s into a silence, and scores whether it sounds finished. It never reads the words or the conversation. Whatever it scores, 3 s of silence ends the turn. A turn still scored mid-thought at that point is marked "trailed off", and the lead's reply to it tends to invite the person to go on | `voiceClient/semantics/` |
| **Wait phrases** | While a reply is awaited, the browser plays stored phrases in the agent's voice: a short word at once ("Mm.", "Hmm.", "Okay."), a mix of an opening and an ending at about 3 and 7 s ("Okay, bear with me."), a longer phrase at about 15 s repeating every 16 s. Made once per voice and kept on disk | `conversations/voice/phrases.ts`, `voiceClient/adapters/fillerPhrases.ts` |
| **Active listening** | A stored word ("Mm-hm.", "Uh-huh.", "Yeah.", "Right.", "Mm.") in any brief pause, after 8 s of speech, at least 10 s apart | `voiceClient/orchestration/activeListening.ts`, `adapters/listenerPhrases.ts` |
| **Encouragement** | After a stop word and 0.7 s of silence, one of "Go on.", "Yes?", "Mm-hm?" | the same files |
| **A short model call** | hq already makes short model calls on its own behalf through the resolver (`resolve` then `hqCallAccess` then `languageModelFor`), costed to the organisation: a voice's sample phrase, and a conversation's title after its first reply | `hq/src/voice/phraseModel.ts`, `conversations/rename.ts` |
| **Measured delay** | The first spoken word waits on the model's first token (2 to 3 s measured) and speech sometimes starts after more than one sentence; one spoken message once produced four turns | [#28](https://github.com/solution84-com/agenthix/issues/28) |

### What the earlier voice work decided about a model-written line

The adaptive voice work built and measured exactly the idea this unit returns to: a small, fast model writes one
spoken line that fits what the person just asked, to fill the wait. Its record is in
[`../2026-10-19-adaptive-voice/`](../2026-10-19-adaptive-voice/):

- **Measured** on 20 Oct 2026, about 2,000 calls across four providers
  (that unit's benchmark, kept outside this repository):
  `gpt-6-luna` on its fast tier and `claude-haiku-5-5` passed the bar (text in about 0.9 s median, 95 in 100 safe to
  say, about $0.03 per 1,000 lines); the fastest models of Google and DeepSeek did not.
- **Set aside** at the unit's walkthrough in favour of stored phrases ([plan](../2026-10-19-adaptive-voice/plan.md),
  the *Holding phrases* row): about 6 lines in 100 were wrong in some way, for example saying the agent was doing what
  the person was doing, and a wrong line spoken just before the reply contradicts it. Every model in that measurement
  missed the time allowed.
- **What could not be settled:** which of the two came last, and why the benchmark lists two supported models while the
  plan says the idea was set aside. No code for the model-written line remains in hq. The history before the platform's
  first public commit is not in this repository.
- **That line saw only the person's last words.** It had no conversation to read, which is where its wrong lines came
  from, and is the gap the owner is describing.

## What this unit changes

### 1. The acknowledgement: the agent says something that fits the conversation when its reply will take a while

The person finishes a sentence. If the agent can answer straight away it does. If the reply needs real work (a task
handed to a worker, or several steps), it first says something that shows it heard and is following, in its own voice
and fitted to what was said, and the real reply follows when it is ready. A long wait gets more of the same kind of
thing, not the same stored phrase again.

**Decided: one call, to the conversation model itself, the one that writes the reply.** It has the whole conversation
and its tools. Its first output says whether the person has finished and whether an acknowledgement is needed; then, if
they have finished, it replies. A side benefit is that the experience follows the model the person or the organisation already
chose for the conversation: a cheaper, faster model gives a quicker decision and reply, a more capable one a more thoughtful
reply and a slightly later decision, and nobody has to choose a second model for voice. There is no second, faster model, no organisation setting for one, and no model list to
choose. Considered and not taken: a separate fast model that writes the line and reads "finished?" beside the lead (the
spike on 9 Nov 2026 found it no more accurate, 92% against 92% on 61 pauses, and it sees only two turns where the one
call sees everything; it also adds a second call, a second set of keys and models, and a setting); more stored
phrases only (cannot know what was said); a native speech-to-speech model (our pipeline hears and speaks through other
services). The figures are in [`prompt-findings.md`](prompt-findings.md).

- **The order of events.** The audio turn model sends the turn, as it does today (about half a second after a clearly
  finished sentence). hq calls the lead's model, which streams. If the person has finished, it simply replies; if
  they have not, it calls a tool, `keep_listening`, with a short reason and writes no words. A tool call is data and
  text is speech, so the API itself separates what is spoken from the decision, and a finished turn streams from the
  model's first token with nothing in front of it. The audio model decides when a turn is sent; the tool can only hold
  it longer (ADR-0179).
- **The acknowledgement is the first sentence of the reply.** If the reply needs real work (background work, several
  steps, or a long answer) the model begins with one short sentence saying it will look into what was asked, naming
  it in a few words, and in the same step makes the tool call that does the work; if it can answer straight away it
  just answers. This agrees with the lead's existing rule that one short line goes in the same step as a handoff.
  The sentence streams with the rest of the reply, so there is no separate field, no candidates and no timer.
- **What the sentence may say (ADR-0178).** Only that it will look into what was asked: never the answer, never what
  it found, never that something is done. The full model, not a local check, is responsible for this and for not
  repeating itself, as it is for every reply; the check on its first sentence is part of the tests.
- **The instruction** is the voice turn block in the lead's turn, only on a spoken message, never cached; the base
  instructions carry no voice text. It says what a voice conversation is and how to speak (short sentences, no
  markdown, a back and forth, numbers in words, speech to text can miss a word, a spoken yes to an approval is read
  back), how to judge whether the person has finished (as a listener would, with examples and not a checklist),
  what to do in each case, and when to open with the acknowledgement. Its text is in
  [`prompt-findings.md`](prompt-findings.md).
- **Slow or failed calls.** A slow call is waited for. If nothing has started speaking by a generous ceiling (about
  4 s, a setting) or the call fails, the turn runs as it does today and a stored **standard acknowledgement** covers
  the wait. If hq tells the client the turn was held, the client expects no reply and plays nothing.
- **Reasoning.** The first step runs with reasoning off or at its lowest, as the checks did, so the first word comes
  sooner; later steps, after tools, are free to think. Anthropic's Sonnet cannot turn thinking fully off on its API
  and runs with thinking only between tools.
- **Cost.** It is the lead's own call, so there is no separate bill. A spoken turn carries about a thousand tokens
  more of instruction, not cached; a turn that is held costs a call that ends at once. Each spoken turn costs about a
  fifth of a cent more on Sonnet and a fiftieth of that on Haiku, un-cached.
- **The real reply** cuts a spoken line off cleanly when it starts, and a line whose reply is ready before it begins playing
  is not played; a line is dropped if the person speaks again before it plays; the line and the reply never speak at once; and
  the line must not become the person's words through echo (the adaptive voice work found a phrase's echo taken for the
  person speaking).
- **Tested on the requests it is tempted to answer:** a labelled set of questions, instructions and requests for a result,
  alongside everyday requests, prompts that provoke wrong claims and thinking-aloud turns. A line that answers, in whole or
  in part, counts as wrong. The test model is DeepSeek Flash.
- **One setting, each person's, named to match the feature.** *Standard voice* has no switch and uses nothing here:
  hearing, speaking the reply, ending a turn (the pause and the audio turn model), telling the person's voice from the
  agent's, and stop words. *Adaptive voice* is each person's own switch, in their voice settings, on by default. It covers
  only what the agent adds: the listening sounds and the acknowledgement, whether the model's opening sentence or the
  stored standard one. Off, the agent says nothing until its reply starts, and turns end as in standard voice. Its (i)
  says what it covers and what is always on. There is no organisation switch: the call is the lead's own, so there is no
  extra model or bill to decide on, and no model to choose. Which model answered, and its cost, are in the usage report
  like every lead turn. The shared (i) button is one small component.

### 2. Has the person finished their thought?

In a brainstorm a person thinks aloud and pauses. The sound model cannot always tell "what if… what's this… what's
that…" from a finished sentence.

**Decided: the same call decides, by calling `keep_listening` when the person has not finished.** The audio turn model
has already sent the turn; the tool can only hold it open, never end one early (ADR-0179). A finished turn needs no
call: the model just replies.

- The model judges the way a listener would: would they expect an answer now, or are they still working out what to
  say? A message that trails off, stops mid-sentence, or ends on a word that leads into more ("and", "so", "because")
  or a pause filler is probably not finished; these are examples, not a checklist, and the whole conversation is used.
  A short message that answers the agent's own question ("Yes.", "Tuesday.") is finished.
- When it calls the tool nothing is said and the turn ends with no reply and no second model call. hq tells the client
  (`turnHeld`) so it expects nothing, and the person's next words join the same message by the path hq already has
  for a person who goes on. If they stay silent, the listening invitation ("go on") plays after a few seconds.
- The tool's reason is logged and never acted on, so later flaws in the model's judgement can be found. A finished
  turn carries no stated judgement, which is the cost of not putting one in front of every reply.
- Measured on the lead's own prompt (version 36), DeepSeek Flash, the real base instructions and a six-turn history, on
  the 61 thinking-aloud pauses (the 44 synthetic ones and the owner's 17 recording pauses), one run each: every one of the
  32 finished turns was answered and none was held, and 20 of the 29 unfinished ones were held (52 of 61 right, 85%).
  Four of the nine misses are pauses that cannot be told from the words ("Send the report to Sam." before the correction);
  the other five answered a hesitation ending on "maybe", "I mean" or a trailing question. The earlier form that wrote a
  judgement in front of every reply read the same pauses at 90% with DeepSeek Flash and 92% with Haiku, so the tool is a
  little less sensitive to a hesitation, which is the price of a finished reply that streams at once. Adding more example
  endings (version 37) changed nothing. On five items over 15 runs (a hold, a recording, a plain question, a short answer
  and a reminder) the tool held 59 of 60 times and the reminder started its work 59 of 60 times. The same 61 pauses on
  Haiku and Sonnet, the models more organisations will use, have not been run.

### 3. The listening family: stored clips in three tiers

**Decided: the stored wait phrases become a fall-back only, and active listening and encouragement merge into one
listening family** with one pool, one rhythm rule and three tiers. Clips are made once per voice and kept; wording below
is a first draft.

| Tier | Clips | Examples | Plays when |
|---|---|---|---|
| 1. Hums | about 10 (5 sounds, each recorded two ways) | "Mm-hm.", "Mm.", "Uh-huh.", "Mm, mm.", "Hm." | Anywhere, including during a question |
| 2. Acknowledging words | about 15 | "I see.", "Right.", "Got it.", "Okay.", "Ah, I see.", "I hear you." | Only when the person is telling or explaining |
| 3. Invitations | about 12 | "Go on.", "Yes?", "I'm listening.", "Take your time.", "Whenever you're ready." | After a stop word and about 2 s of silence; and partway through a turn held open (part 2) |

- **Left out on purpose:** "Sure", "Makes sense", "Good point", "Interesting". They sound like agreeing or judging; the
  agent shows it follows without taking a side.
- **Rhythm:** a hum or word plays in a brief pause (0.3 s of silence) where what was heard ends in punctuation (a sentence or clause end; if the speech service adds it late, the sound is late, and past the longest wait any pause will do), after at least 8 s of speech (counted across
  the messages hq held), never started over them and never while the agent speaks. It does not wait for the turn
  model or the lead to rule on the pause: a hum is not a reply, so it comes while the person talks. At least 10 s
  after the last, a random gap of 10 to 25 s. No skip chance; the gap does that job. About 3 to 4 a minute, below the
  human rate because the agent hears through a delay. None of the last 6 played is repeated, across all tiers. Played
  6 dB under a reply. A hum or word that began is left to finish if the person goes on (half a second); an invitation
  is cut at once.
- **Fit:** a cheap local check on the last words decides whether an acknowledging word fits (a question or request gets a
  hum or nothing; acknowledging words only when the person is telling or explaining). Letting the model choose the sound
  was tried and added nothing: it chose a hum 22 times of 23 and never an acknowledging word.
- **The standard acknowledgement** (the stored wait phrases) plays only when the call fails outright or passes its ceiling, never as a ladder at 3, 7 and 15 s and never as a short
  word at once. The existing set stays for that.
- **Unchanged:** the person's stop words and acknowledgements ("mm-hm" does not stop the agent). The lead no longer
  asks the person to go on when they trail off; it says nothing, and this family's invitation tier does.
- A voice whose clips are not made yet plays the tiers that exist and is silent otherwise.

### 4. One key for voice: Inworld hears as well as speaks

Inworld offers streaming speech to text (documented by Inworld as experimental at the time of writing). Hosted voice
would then need one key.

**Decided: Inworld is the default way to hear whenever it can deliver, and AssemblyAI stays fully supported and
chosen per organisation and per agent (a speech-to-text setting for both already exists).** One key is better than two
whatever the other performs like. If Inworld measures worse, it is still offered as the one-key way, and the choice
says plainly what it costs in quality and recommends AssemblyAI for quality. Only a hard failure (it cannot be used
from the browser at all, or it fails end-of-turn on built-in speakers) changes the default.

**Already measured (8 Nov 2026), so not a spike:** on the same synthetic speech sent at real-time pace, three phrases of
2, 9 and 15 s, three runs each, Inworld and AssemblyAI are close. First interim text 0.54 to 0.65 s against 0.50 to
0.60 s. Final text after the client ends the turn itself (as voice does) 0.27 to 0.29 s against 0.20 to 0.21 s. Word
error rate 0 % on all three for Inworld, and 0 %, 6.9 % and 11.1 % for AssemblyAI (mostly "3" against "three"). The same
Inworld key that speaks also authenticated the speech-to-text socket, so one key covers both. A browser can stream to
Inworld directly: hq mints a single-use, short-lived token and the browser opens the socket with it, so no audio passes
through hq. On the server's own turn detection Inworld waits about 0.4 to 0.6 s longer than AssemblyAI; voice ends turns
itself, where the gap is about 0.07 s. A turn is capped at about 30 s, so a long monologue needs regular turn ends, and
word confidence is not provided.

**Feature parity (read against the voice client's port, with real probes):** nothing is a hard failure and the client's
reconciler, lag, send queue, echo filter and utterance code need no change. The new hearing adapter has to number the
turns itself (Inworld sends no turn number); a token is single use, so each connection attempt needs a fresh one (60 mints
a minute per key); an open-session limit applies (20 on the development account); a long socket ran 12 minutes with no
close, with the maximum length undocumented; a vocabulary list made it invent a word out of silence, so vocabulary
boosting is not offered on it without checking real audio; and spoken times can come back as digits that change the
meaning ("ten past nine" as "10:09"). Word confidence is not provided, and the product does not use it. It lists 30
languages against AssemblyAI's 32.

**Not yet measured, and checked when it is built, through the environment's replay of the owner's recordings:** real
microphone audio and noise, including the agent's own voice through built-in speakers; non-English (Inworld's
documentation lists many languages, with English available and the others marked experimental, to be checked before any
is promised); and concurrency. These decide only whether the note recommending AssemblyAI is shown, and the hard
failures above.

A free self-hosted speech service as the default is a separate, larger question and is not part of this unit. The setup
flow and the user guide's voice pages change with it: setup asks for at most one voice key.

### 5. The first spoken word, and one turn per message

[#28](https://github.com/solution84-com/agenthix/issues/28): start speech on the first complete sentence, find why one
spoken message produced four turns, and consider running independent read-only tool calls side by side. Taken here
because the acknowledgement hides a wait that this removes.

## Trying it on its own

The owner tries it in two dev-only pages inside hq, both refused outside development:

- **The voice lab** hooks into a real conversation and shows what voice is doing in it, to debug it.
- **The voice playground** (plan, phase 4b) is standalone and tied to no agent and no conversation record. It is a browser page that runs hq's own voice client and the lead's own voice logic, with a model chosen on the page. It can be talked to live with the microphone, replay the owner's own recordings, or run a library of scripted scenarios, each with the behaviour it should get, against one or several models and score them; it has a stand-in lead (a fake model after a delay) beside a real model; it plays the stored phrases; and its Decisions panel shows each turn's decision (held and why, the opening sentence, how long each took). Changing the instruction or a setting there never touches the agent code.

The lead's voice logic (the `keep_listening` tool, the rule for when a turn may be held, the voice turn block and the reading of a model's stream) is a pure module in hq. The real turn and the playground both use it, so what is tried is what ships. A package is not needed, since nothing outside hq shares it.

(A first version ran outside the repository as scratch while the design settled, plan, phase 2. It ran a copy of the lead's turn; the playground replaces it.)

## Measuring it

The same recorded conversations and the same checks before and after, so the result is a number and a recording, not an
impression:

- time from the person's last word to the first thing the agent says, and to the real reply's first word;
- whether an acknowledgement ever contradicts the real reply, or answers the request itself instead of only saying it is
  looking into it (a labelled set, the benchmark's wrong lines among them, and requests the model is tempted to answer);
  and whether the model leaves the acknowledgement out when it can answer straight away;
- repetition: in a ten-minute conversation, how many times the same phrase is heard, and how many listening words a
  minute in a long turn;
- turns wrongly cut and turns wrongly held, on the owner's brainstorming recordings;
- word error rate and end-of-turn behaviour for each way of hearing;
- the extra cost per thousand pauses of the one call, at list prices, with and without caching the fixed instruction.

A person talks to it for a long time, the way the owner did, and says whether it still feels disconnected. That is the
test that matters; the numbers are there to find why.

## Not in this unit

A free self-hosted speech service as the default; expressive direction fitted to each reply; the unattended-agent and
self-hosted voice work; any change to the stop-word and acknowledgement rules.

## Decisions

Made by the owner on 8 Nov 2026, in the order asked:

1. One call, to the conversation model itself, decides whether the person has finished and, when the reply will take a while, opens with a short acknowledgement. No separate fast model, no organisation setting, no model choice ([ADR-0181](../../adr/adr-0181-the-conversation-model-decides-the-voice-turn-in-its-own-call.md)).
2. Stored wait phrases are a fall-back only; active listening and encouragement stay, as one family in three tiers with
   a much larger pool, an irregular rhythm with a floor and a ceiling, and a cheap local check for fit.
3. The organisation pays through the lead's own model, as for every turn.
4. Whether a thought is finished is the lead's own judgement, made as it begins to answer: not finished is a call to a
   `keep_listening` tool, finished is simply a reply. The audio turn model still sends the turn; the tool can only hold
   it open, and its reason is logged.
5. Inworld is the default for hearing when it can deliver; AssemblyAI stays supported; the spike informs and does not
   gate.
6. It ships before the first release is cut, on its own short branch off `main`.
7. The instruction is a voice turn block in the lead's turn, written and tested over versions 24 to 36 (the accepted text is in
   [`prompt-findings.md`](prompt-findings.md)): how to speak in a voice conversation, how to judge whether the person has
   finished, and an opening sentence only when the reply needs real work. The decision is a tool call, not a JSON form,
   tags or a marker; there are no candidates, no local pick and no local checks. Rotating several prompts, letting a small
   model answer and using only its first sentence, a model-written voice direction and a model-chosen listening sound
   were tried and not taken. It is to be polished after it is built if the checks show a need.
8. One setting: each person's *Adaptive voice* (the listening sounds and the acknowledgement; on by default). No
   organisation setting. The audio turn model, ending a turn and telling voices apart are standard voice and not part of it.
