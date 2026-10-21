---
name: A spoken turn
description: Speech in, an ordinary turn, the reply spoken sentence by sentence; a shown part is said as one line and opened from a card; an interruption cancels the turn; a result waits for the sentence.
created: 2026-10-16
author: leang
---

# A spoken turn

Voice as a mode of the conversation. Spec: *Voice*.

```mermaid
sequenceDiagram
  participant P as person
  participant V as voice<br>speech to text · pause to send · text to speech
  participant C as coordinator
  participant L as lead
  P->>V: speech, streaming into their bubble
  V->>C: message on the pause, flagged spoken
  C->>L: turn (turn block: voice mode)
  L-->>V: reply, streamed
  V-->>P: sentence by sentence; the bubble fills in step
  L-->>V: a shown part: title · spoken line · body
  V-->>P: speaks the line; the thread shows a card
  P->>P: opens the card; voice continues
  P->>V: speaks over the reply
  V->>C: cancel the turn
  C->>C: record keeps what was heard, marked interrupted
  V->>C: the new message
  C->>L: next turn
  Note over C: a result arrives from an operation
  C->>C: waits for the running turn to end
  C->>L: report turn; its speech starts after the current sentence of playback
  L-->>P: one sentence, then an offer of the detail
```

The voice session stays up throughout: a cancelled turn never restarts it. A shown part is a fenced block in the reply, said as its one line and opened from its card without stopping the voice.
