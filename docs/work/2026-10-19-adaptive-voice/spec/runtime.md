---
name: Adaptive voice — the real-time runtime
description: The three loops under every layer, with bounded queues, ids and cancellation, so a slow or failing service never builds a backlog and never loses what the person said.
created: 2026-10-19
author: leang
---

# The real-time runtime

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.

Keeps the layers in step, whatever the services do. **Three independent loops, never one serial queue.** Every
event carries its capture time, its order and, where it belongs to a reply, the reply's id (the generation id), as
[How it is built and tested](building-and-testing.md) lists. The runtime is the only part that knows about
concurrency; the components it connects are pure.

## Inbound loop: microphone → clean-up → AssemblyAI

- **The send queue holds about one second of audio at most.** When the speech service stops taking audio as fast as
  it comes (the browser's send buffer backing up), the
  queue fills.
- **At the limit, the connection is replaced; the person's words are never dropped.** A fresh connection opens with a
  token fetched ahead. Audio is sent to it **at the pace of speech, never in a burst**, because a burst made the lag
  worse. It catches up only by **leaving out silence, never words**: it starts at the first queued audio that holds
  speech, as silence detection marks it, with 300 ms before it. The new connection's words are lined up with the
  old one's by their times.
- **The lag is measured all the time**: from a word spoken to its words arriving. If it grows past about 2 s, the
  connection is replaced the same way, at the next pause.
- **In a long silence the connection is closed, and the next speech opens a fresh one.** After about 3 s of silence,
  once the connection has heard everything before it, it closes. When silence detection next says voice, a new
  connection opens on the token kept ready, the 300 ms before the voice are sent at once, and audio then goes at the
  pace of speech. A connection is never left open with a gap in its audio, because a gap made the service fall
  20 to 40 s behind. Audio counts as silence until silence detection first says voice, so the first connection opens
  at the person's first words.

## Decision loop: silence → Smart Turn → READY → hq

- Smart Turn runs in a Web Worker with **a queue of one**. If it is still busy when the next check comes, the older
  request is dropped, never queued: only the latest audio matters.
- READY sends the message to hq; hq admits it under the person's *Wait* or *Interrupt* setting.

## Outbound loop: the lead's reply → speech → playback

- The reply streams from the lead's model; each sentence goes to text to speech as it completes, overlapping the
  stream wherever it is safe.
- **The buffer holds about two sentences ahead of what is playing.** A slow speech service shows as a pause, never as
  a backlog.
- **Everything carries the reply's id.** A cancellation removes that reply from every queue at once, and playback
  drops any audio whose id is not the current one. Ducking and stopping happen in the page, with no round trip.

## When a service is slow or down

| Service | What the person sees and hears | Recovery |
|---|---|---|
| Speech to text | "Reconnecting…" on the voice pill | The connection is replaced as above; no words are lost |
| Smart Turn | Nothing but a slower turn | The decision falls back to silence alone, READY at 3 s |
| The lead's model | The thinking indicator, then one line in the thread | The turn ends; voice stays on |
| Text to speech | The reply finishes as text, with one line why | The next reply tries speech again |

No retry or queue is hidden or unbounded: every queue has a limit, and every limit has a stated action.
