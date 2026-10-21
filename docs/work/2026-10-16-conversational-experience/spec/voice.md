---
name: Voice
description: Voice as a mode of the conversation on web and phone; a spoken turn is an ordinary turn; the lead's register; shown parts.
created: 2026-10-16
author: leang
---

# Voice

Part of the conversational experience's spec: the [overview](../spec.md) holds the terms, the governing
decisions and the data model this part builds on.

*Changed 2026-10-17, the walkthrough: dictated words show as they are spoken and are corrected in place; voice
keeps the agent's own voice out of what it hears; each message gets its own connection to the speech service, sent
audio at the pace it is heard; cutting in goes by the person's own words. Voice is still unreliable on laptop
speakers.*

*Diagram: [A spoken turn](../diagrams/voice-turn.md).*

**Voice is a mode of the conversation, not a call screen.** On the web as on a phone, voice runs inside the
conversation view, the pattern people know from the assistants they use: the thread stays, the words stream into
it, and one button in the message box turns voice on. Underneath sits the conversation layer, so a spoken turn
commissions work, hears results and is recorded like a typed one.

**A spoken turn is an ordinary turn.** Speech to text produces the message; it streams into the person's own bubble
as they speak and is sent when they pause, with the speech service's own end of turn and no wait of the platform's
own — set to wait for a second of silence after a finished sentence, and three at most, so a pause mid-thought does
not hand the turn to the agent. The coordinator admits it like a typed message, so the person's Wait or Interrupt setting applies, the turn
can be cancelled, and anyone who may send into the conversation may speak into it — in a task's thread, one
person at a time; a second who starts voice is told it is in use. The lead streams the reply; a
sentence accumulator hands each sentence to text to speech as it completes, with word timings, and **the reply's
bubble fills in step with the voice**, word by word at playback speed, never ahead of it and nothing highlighted.
The record holds the text, with a *spoken* flag the lead reads and the screen does not show. Audio is never stored.

**The message box.** One pill: plus, text, a microphone, and one right button. Empty, the right button starts voice
mode; with text it sends; while a reply runs it stops. From two lines of text, the text takes the whole width above
the buttons, which sit in a row underneath. The microphone is dictation into the box: **the words appear as they
are spoken**, as ordinary text where the cursor was, and are rewritten in place as the speech service corrects
them into the finished sentence. The person can type around them at any time, and editing the heard words makes
them the person's. Send or Stop asks the service to finish what it is still hearing and keeps it, and what is heard
before the connection opens is held and sent once it does, so nothing said is lost. Each dictation is a short
connection of its own, and its token is fetched ahead when the person focuses the box or points at the microphone. In voice mode,
mute and End sit beside the pill and hide while the person types; the box stays usable throughout, so a misheard
word is fixed by typing, and a typed message in voice mode is answered aloud to the person holding voice; in a
task's thread another person's typed message is answered in text, read by all, not spoken. The plus holds the model choice. Who
is talking shows as a glow behind the thread and a ring on the pill in the speaker's colour: the accent for the
person, green for the agent, neutral while listening, dimmed while muted. The right button is greyed, with the
reason, when the agent has no voice, the organisation has no speech-to-text or text-to-speech, or no model access
serves a turn. Speech providers stay organisation settings, outside the model policy.

**One way of talking.** Hands-free, sent on a pause, with dictation and typing beside it. The tap, hold and
trigger-word modes and their settings go: they predate working turn detection, and no assistant people use has them.

**The lead's register in voice mode.** The turn block says the person is listening, not reading, and the lead's
instructions change register: short turns, one point then hand back, ask before a second point; plain prose with
no headings, lists, tables, code or markup; numbers and names in words; a result as one sentence, then an offer of
the detail.

**Shown parts, for what must be seen.** When a reply needs a diagram, a table, code or a long list, the lead wraps
it in a *shown part*: a fenced block inside the reply with a **title**, a one-sentence **spoken line**, and the
body in ordinary markup. It is a block and not a tool call so that the reply stays one stream and nothing pauses.
Voice skips the body and speaks the line in its place — "I've put a diagram in the thread that shows the three
steps and where the time goes; tap it to open" — then carries on. On screen the part is a card in the thread with
its title and *open*; opening it shows the body in a viewer beside the thread on the web and in a sheet on a
phone, **without stopping the voice**, so the person reads while the agent keeps talking and the pill, mute and End
stay in reach. Outside voice mode the same part renders inline, as any markup does today: one marking, two
renderings, and the record holds the reply once with the part inside it. Should the lead write markup in voice
mode anyway, voice strips what cannot be read and speaks the prose; the screen shows the reply as written.

**Keeping the agent's own voice out.** The microphone stays open while the agent speaks, and on laptop speakers the
browser's echo cancellation lets some of the agent's voice through, which the speech service transcribes. So voice
lines up what the service hears, by its word timings, with what the agent was saying at that moment, word by word
in order: words that continue the agent's own are its echo and are dropped, and while the agent's audio plays, and
for a second and a half after, fewer than two words of the person's own are noise. Only the person's words reach
their message. Loudness alone never counts as the person speaking.

**Interrupting.** The person speaking over the reply — two words of their own — stops the audio and cancels the
turn; the record keeps the sentences that were heard, marked *interrupted*, so the next turn knows what the person
did not hear; their new words are the next message. The voice session stays up: cancelling a turn never restarts
it. How soon the reply stops depends on how soon the speech service writes those words.

**One connection to the speech service per message.** The service falls further behind the longer one connection
streams, so voice moves to a fresh connection when a message is sent, when the agent's voice ends, when one is
older than twenty seconds and nobody is mid-sentence, and when one has more than a second of audio waiting to go
out — never while the person is speaking over the reply. Audio goes at the pace it is heard, never in a burst: of
what is heard while a connection opens, only the last fraction of a second is sent, and only when someone is
speaking. The token a connection needs is fetched ahead, from when the person points at or focuses the voice
button, so starting voice does not wait on it.

**Not reliable yet.** On laptop speakers the person's words can still appear seconds late, and cutting in arrives
late with them.

**Work in voice mode.** A foreground operation that finishes within the wait limit is answered in the same breath. A
background one is acknowledged aloud and shown in the work bar. A result that arrives while voice is on
takes its report turn **after the current turn ends**, as the conversation layer says for every completion; if the
previous reply's speech is still playing, the report's speech starts after the current sentence, never over it, as
one sentence and an offer of the detail. One that arrives after voice ends is read, not spoken.

**Approval by voice.** The lead asks aloud and the approval card shows in the thread as always. The person taps, or
says yes; a spoken yes counts only after the lead has read the action back in one sentence ("Approving: deploy to
staging. Yes?"), and the approval records that it was spoken, with the transcript. Hands-free is the reason to
allow it; the read-back is the reason it is safe. A worker's request that arrives during voice takes no turn and is
not spoken: it shows in the work bar, and the person answers it there, or asks about it and answers in words
(*Conversation layer*).

**Voice survives navigation.** Leaving the conversation page keeps voice going. On the web a slim bar at the top of
every page shows the agent, who is talking, the outstanding operations, mute and End, and returns to the thread
when clicked; on a phone the system's ongoing-audio card does the same with the screen locked or another app in
front. Closing the tab ends voice; a running turn finishes as text in the thread.

**The record carries what each client would otherwise invent.** Voice starting and ending write quiet lines into
the thread ("Voice · 10:58", "Voice ended · 4 min"); two minutes of silence on both sides ends voice, warned fifteen
seconds before; the *interrupted* mark and the *spoken* flag are the record's. Web and phone read these from hq
and keep no rules of their own.

**Rules the mode adds:**

| Situation | Rule |
|---|---|
| The person speaks while the agent speaks | Two words of their own stop the audio; the turn is cancelled; the record keeps what was heard; the agent's own voice heard back never counts |
| The person types while the agent speaks | As typed turns: waits or interrupts by their setting; voice answers the holder aloud, anyone else in text |
| A result arrives during a turn | Its report turn starts after the turn ends; its speech after the current sentence of playback; never spliced into the stream |
| Two minutes of silence on both sides | Voice ends, warned fifteen seconds before; *Voice ended* in the record |
| Voice ends with a turn running | The turn finishes as text; nothing more is spoken |
| Speech to text fails | Voice ends with one line why; the conversation continues typed |
| Text to speech fails mid-turn | The reply finishes as text, with one line why |

**Options considered.**

- *A call screen of its own, with an avatar and highlighted subtitles* — what the web has today. It hides the thread
  and the approvals during the call, and people expect one pattern across their devices.
- *Tap, hold and trigger-word modes as settings.* Four ways to do one thing; a pause is what every assistant uses now.
- *A realtime speech-to-speech model.* The lowest latency, but it fixes the vendor and the model outside the policy
  and the access tiers, and the record, memory, tools and ledger all run on text. The adapter may take one later for
  the talking model only, behind the same contract.
- *A tool call to create a shown part.* Pauses the stream and splits the reply in two; a block streams with the
  rest and lands in the record as part of one reply.
- *Read markup aloud, or strip it silently.* A table read aloud is unusable; stripped silently, the person never
  learns it was there.
- *Open the viewer automatically.* Takes the screen mid-sentence; a card the person opens keeps them in charge.
- *Store the audio.* Size, privacy, and nothing reads it; the transcript is the record.
- *Tap-only approvals.* Defeats hands-free; the read-back makes a spoken yes as deliberate as a tap.
- *Each client with its own quiet lines and silence rule.* Two implementations drift; the record is the one place both read.

**What changes from today.** The web's voice replaces the conversation view with a call screen; voice becomes a
mode inside the view. Today's voice path starts the run at once, so the Wait or Interrupt setting does not apply
to speech; it does not say which run it started, so the client guesses from the first streamed text; it has no
stop-speaking event, so an interruption restarts the whole voice session; and it is open only to the conversation's
owner. With a spoken turn as an ordinary turn each of those goes away by construction. The reply spoken sentence by
sentence with word timings stays: it is what the in-step reveal needs.

## Acceptance criteria

- [ ] Voice runs inside the conversation view on the web, with the reply's text in step with the voice,
      interruption, mute and End beside the pill, the bar on other pages, and shown parts spoken as their line and
      opened from a card; a spoken turn obeys the Wait or Interrupt setting.
