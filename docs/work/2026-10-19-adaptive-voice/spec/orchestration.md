---
name: Adaptive voice — Orchestration
description: Conversational state and responses: who holds the floor, barge-in, the response scheduler, the agent's hand-raise and active listening.
created: 2026-10-19
author: leang
---

# Orchestration · conversational state and responses

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.

Decides who holds the floor, and what the agent does about it. **It uses no model**: every part is our code,
deciding from three signals, Acoustic's **silence: yes / no**, STT's **words**, and Semantics' **READY**.

**In:** silence, words, READY, a raised hand from hq, the person's taps. **Out:** duck, stop or resume to playback;
the message and any cancellation to hq; a chime and a badge to the person.

## 1 · The floor

A small state machine in the browser. Every other part reads it before acting.

| State | Meaning |
|---|---|
| Open | Nobody is speaking |
| Person speaking | Silence: no, from the person |
| Person pausing | Silence: yes; Semantics is deciding |
| Agent thinking | READY was sent; no reply audio yet |
| Agent speaking | Reply audio is playing |
| Ducked | The agent is speaking, and the person may be cutting in |
| Hand raised | An agent has an update and is waiting for an opening |

## 2 · Barge-in

The person speaking over the agent takes precedence over anything the agent is saying.

1. **Duck, at once.** On silence: no while the floor is *Agent speaking*, playback's volume drops by about 15 dB
   within 50 ms, through a gain control in the page, with no call to hq. The floor goes to *Ducked*, and a
   **confirmation window** of about 1.5 s opens: long enough for STT's words, which arrive about a second late.
2. **Confirm, from the words**, after the agent's own words heard back have been dropped:

   | In the window | Decision |
   |---|---|
   | A stop word: "stop", "wait", "hold on", "hang on", "no" | Stop, even on one word |
   | Two or more of the person's own words that are not an acknowledgement | Stop |
   | Only an acknowledgement: "mm-hm", "yeah", "okay", "right", "uh-huh", "got it" | Resume |
   | Nothing, and silence returns (a cough, a leftover of echo) | Resume |
   | Something unclear, such as one word that is neither | Stay ducked about 1 s more; resume if nothing follows |

   The agent never asks aloud whether it was interrupted: a spoken check risks talking over the person, and staying
   ducked and silent costs a second at most.
3. **Stop.** Playback stops locally, at once. The browser tells hq to cancel the reply and how much of it was heard;
   hq cancels the lead's turn and the speech stream, and the record keeps what was heard, marked *interrupted*. The
   floor goes to *Person speaking*, and their words become the next message.
4. **Resume.** The volume ramps back up over about 300 ms, and the agent carries on.

The window, the levels and the word lists are starting values, set by measurement.

## 3 · Response scheduler

- **On READY, once STT has heard to the end of the speech and finished the turn**, the browser sends the person's
  words to hq as a spoken message. STT's words can run behind the voice, for example just after a connection is
  replaced; silence detection can miss a soft last word; and STT's last word can still be part of one ("do" for
  "dokie"). So on READY the browser asks STT to finish the turn it is hearing, and the send waits until the words
  heard reach the moment the voice ended and STT has finished the turn, or until STT's lag plus about 1 s has
  passed. If the
  person speaks again meanwhile, the send waits for the next READY. The coordinator admits the message under the
  person's *Wait* or *Interrupt* setting.
- **The reply goes out sentence by sentence**: it streams from the lead's model, each sentence goes to text to speech,
  and its audio reaches the browser tagged with the **reply's id**, the generation id.
- **Filler phrases cover the wait.** While a reply is awaited, the browser says it heard, in the agent's voice, and
  says a little more the longer the wait, less often as it goes. A short sound ("Mm.", "Okay.") the moment the
  message is sent; at about 3 s and again at about 7 s, a mix of an opening and an ending ("Okay, bear with me.",
  "Hmm, okay, let me think."); at about 15 s a longer one ("Sorry, this one's taking a little longer."), repeating every
  16 s until the reply comes. Every opening fits every ending, and neither says anything about the request, so no
  phrase can be wrong about it. The openings are calm ones: "Alright," and "Sure," came out loud and bright, and
  broke the person's train of thought. hq makes the phrases with text to speech, each mix spoken as one sentence, keeps them
  once per voice, and sends them as voice starts, the shortest first; the mixes are six drawn afresh each time, each
  opening and each ending in only one. None of the last five said is said again while another can be; never closer
  than about a second after the last, and never while the person holds the floor; the person speaking stops one at
  once. A reply that arrives while one plays waits for it to end and follows it straight away: a phrase is never cut
  off by the reply. The echo check hears them as the agent's audio. They are part of no reply, and nothing of them
  is written into the conversation. A message sent as the person trailed off (§5) gets none but the longest wait's:
  its reply is most likely an encouragement response, and "let me think" before it would sound wrong.
- **Stale audio is dropped.** Playback discards any audio whose reply id is not the current one, so audio from a
  cancelled reply still in flight is never heard.
- **The person speaks again before the reply is heard.** If silence: no arrives while the floor is *Agent thinking*,
  after READY but before the first audio, or STT shows new words of theirs then, the pending reply is cancelled and
  the new words are **added to the same message**. A turn that Semantics ended too early never brings a premature
  reply. The cancelled reply is withdrawn: with none of it heard and nothing started or set by it, the thread does
  not show it and the lead does not read it. A reply the person stopped, by *Stop* or by speaking over it, still
  shows *Stopped*. A reply that arrives while the person has words on screen not yet sent waits for them, as it waits while
  they hold the floor: silence detection can take their voice for a filler phrase's echo, so the floor alone does
  not show that they are speaking.
- **Words are never left unsent.** When silence detection missed the person's voice, no pause is timed and no READY
  comes. Words on screen that have not changed for the pause cap (about 3 s), while the person is not heard
  speaking, are sent as the cap would have sent them.
- **Recovery.** Text to speech fails mid-reply: the reply finishes as text, with one line why. The lead's model
  fails: one line in the thread. No first audio within a few seconds: the thinking indicator shows. Nothing is
  retried or queued without a limit.

## 4 · Hand-raise

An agent with an ordinary update, such as a result arriving while voice is on, asks for attention instead of
interrupting.

1. **hq marks the update as a raised hand.** The browser plays a soft chime and shows a raised-hand badge on the
   voice pill; the floor goes to *Hand raised*.
2. **It waits for an opening:** the floor has been *Open* for about 2 s, or the person invites it, by tapping the
   badge or saying "go ahead", "what is it" or "yes?".
3. **Then the agent takes its turn:** one sentence, and an offer of the detail.
4. **The person's own turn always comes first.** A raised hand never takes the floor from a reply the person is
   waiting for.
5. **A critical update** is exceptional and governed by policy, such as an approval that will expire: it speaks after
   the current sentence, without waiting for an opening. What counts as critical, and the person's control over
   it, belong with the interruption preferences planned separately; this part defines the states and events only.
6. **A hand nobody answers is let go after about 60 s.** The badge goes, and the update is reported as text in the
   thread while voice stays on.

## 5 · Active listening

The agent shows it is following while the person talks, the way a listener says "mm-hm", and encourages them to go
on when they have stopped it or trailed off, instead of answering half a thought. Four terms, used throughout:

| Term | What it is | Who chooses the words |
|---|---|---|
| **Filler phrase** | Said while a reply is awaited, so the wait is not silent (response scheduler) | hq, from a stored list |
| **Active listening phrase** | A quiet "mm-hm" in a pause while the person talks at length | hq, from a stored list |
| **Encouragement phrase** | An invitation to go on after the person stops the agent with a stop word | hq, from a stored list |
| **Encouragement response** | A reply that only invites the person to go on, when their words trailed off | The lead, in its own words |

A *phrase* is stored and played by hq; a *response* is the lead's reply.

1. **While the person talks at length, an active listening phrase in their pauses.** When the person has been speaking for
   about 8 s or more in the message they are speaking, and they pause, and the decision rule answers
   **KEEP_LISTENING** (they are mid-thought), the browser plays one, short and quiet, in the agent's voice: "Mm-hm.",
   "Mm.", "Yeah.", "Right." or "Uh-huh.", about 6 dB below the reply's volume.
   - Only on KEEP_LISTENING: never on UNCERTAIN or READY, where it could be taken for the agent starting to
     reply, and never while the person is speaking.
   - At most one in about 8 s of their speech, and about one chance in three of none, so it does not feel
     mechanical; never the same one twice in a row.
   - It stops at once if the person speaks again. It changes nothing in turn-taking: the pause timer runs on, and
     READY comes when it would have.
2. **After the person stops the agent with a stop word, an encouragement phrase.** When a barge-in stops the agent
   on a stop word ("wait", "hold on"), and the person then says nothing for about 0.7 s, the agent says one: "Yes?",
   "Go on." or "Mm-hm?", never the same twice in a row, and then nothing more until they speak. None
   after the *Stop* button, which asks for quiet, or after a barge-in on the person's own words, since they are
   already speaking. The stop word said alone is not sent as a message: it joins what the person says next.
3. **When the person trails off, an encouragement response, and the thought stays one message.** A long pause
   mid-thought, as in brainstorming, still ends the turn at the pause cap (about 3 s), and the words go to hq, so
   the lead judges with the whole conversation whether the person has finished. When what was said stops
   mid-thought, a sentence left unfinished or words that seem to be missing, the lead does not answer it: it
   replies with a short **encouragement response** only, different each time ("Mm?", "Go on.", "Sorry, you trailed off.
   What were you saying?"), marked as one. Two things tell it:
   - **The words.** The lead's instructions for when the person is listening say to do this.
   - **How the turn ended.** The browser sends, with the spoken message, whether it ended **on a finished turn** (the
     decision rule's READY) or **on a long pause** (the cap, with the turn model's confidence at KEEP_LISTENING's
     level or below). On a long pause, the turn block tells the lead the person may not have finished.

   The encouragement response is spoken, but it is not the agent's answer. What the person says next **joins their unfinished
   message**, as words spoken before a reply is heard do (response scheduler), and the whole is answered. It is
   then withdrawn: kept in the record but not shown in the thread, and the lead reads it as a note on the joined
   message ("they paused mid-thought; you said 'Mm?', and they went on"). If they had in fact finished and say
   something new, it joins too, and is answered with the rest.

   Speech to text can miss words, so when the person says they already said it ("I just told you"), the agent
   apologises in a few words ("Sorry, I didn't catch that.") and asks them to say it again; it never insists they
   did not.
4. **Active listening and encouragement phrases are made like the filler phrases.** hq makes them once per voice
   with text to speech, keeps them, and sends them as voice starts, so playing one adds no delay and no call. The
   echo check hears them as the agent's audio. They take no model call, are part of no reply, and nothing of them is
   written into the conversation.
5. **One relaxed tone.** On a text-to-speech model that takes a spoken direction (Inworld TTS-2), filler, active
   listening and encouragement phrases, and encouragement responses, are all made with the direction "[relaxed, low
   voice, thinking]", so encouraging the person sounds the same whoever chose the words. The direction is not said,
   and is left out of what the screen reveals. Other replies are not steered. On a model without directions they are
   made as written.

The 8 s, the gaps, the level and the lists are starting values, set by trying them.

## Today

Two of the person's own words stop the agent and cancel the turn; nothing is lowered first, a short acknowledgement
can cut the reply, and there is no hand-raise. A result arriving during voice speaks after the current turn. The
agent makes no sound while the person talks, and none after being stopped.
