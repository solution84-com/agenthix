---
name: Voice Integration Design
created: 2026-04-18
description: Design spec for Voice Integration Design. Front-matter added during the docs/ migration; body unchanged.
---


# Voice Integration Design

**Date:** 2026-04-18
**Branch:** feature/voice-integration
**Status:** Approved

---

## Overview

Add voice capability to the Agenthix platform, enabling users to have real-time voice conversations with agents through the chat panel. The agent retains full intelligence — file system access, MCP calls, skills, session history — because the LLM step runs through the existing ChatRunner, not through Inworld's pipeline.

**Provider:** Inworld (STT + TTS only). Adapter pattern used so additional providers can be added later.

**Scope (v1):**
- Admin provisions Inworld API key
- Admin configures org-wide voice/turn-detection settings
- Per-agent voice config (enable, voice, TTS model)
- Mic button in chat panel — streaming STT → ChatRunner → TTS → audio playback
- Web app only; native mobile follows once web is stable

**Out of scope (v2+):**
- Thinking commentary / agent narrating its reasoning
- Per-user voice preferences
- Per-agent turn detection overrides
- WebSocket streaming TTS
- Additional voice providers (ElevenLabs, etc.)

---

## Architecture

### Pipeline

```
Browser (mic)
  → audio chunks via Socket.io (voice:chunk)
  → Server voice handler
  → Inworld STT WebSocket (streaming)
      ↓ partial transcripts
  Server: turn detection logic
      ↓ endTurn → final transcript
  ChatRunner (full agent context — files, MCP, skills, session history)
      ↓ response text
  Inworld TTS (HTTP streaming)
      ↓ audio + transcript
  Server → Socket.io (voice:end) → Browser
```

### Transport

Reuses the existing Socket.io infrastructure (`webSocketFn` in `main.wasp`). Voice events are new event types on the same socket — no separate WebSocket server needed.

**Socket.io events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `voice:enter` | Client → Server | `{ agentId, sessionId }` — user enters voice mode |
| `voice:exit` | Client → Server | — user exits voice mode |
| `voice:chunk` | Client → Server | `{ audio: Buffer }` — continuous audio (always-on) or held audio (hold-to-speak) |
| `voice:turn_end` | Client → Server | — hold-to-speak only: user released button |
| `voice:partial` | Server → Client | `{ transcript: string }` |
| `voice:response` | Server → Client | `{ transcript, responseText, audio: Buffer }` (audio is PCM16 24kHz mono) |
| `voice:barge_in` | Server → Client | — agent interrupted, client stops audio, server resumes Listening |
| `voice:error` | Server → Client | `{ message: string }` |

### Turn Detection Logic (server-side)

```
if triggerWord mode:
  monitor partial transcripts for triggerWord
    → strip trigger word
    → send endTurn to Inworld STT
    → process final transcript

  if silence > maxSilenceSec (safety valve):
    → close STT socket
    → process whatever transcript exists as partial turn

if eagerness mode:
  if silence > eagernessThresholdSec:
    → send endTurn to Inworld STT
    → process final transcript
```

Silence is tracked server-side by measuring gaps between incoming audio chunks.

### Voice Provider Adapter

```typescript
interface VoiceAdapter {
  transcribe(chunks: AsyncIterable<Buffer>, config: STTConfig): AsyncIterable<PartialTranscript>
  synthesize(text: string, config: TTSConfig): Promise<Buffer>
  listVoices(apiKey: string): Promise<Voice[]>
}
```

`InworldVoiceAdapter` implements this interface. Future providers (ElevenLabs, etc.) implement the same interface and are selected by `VoiceProvider.provider`.

---

## Data Model

### New: `VoiceProvider`

Site-wide singleton — one active record for the platform. Admin-managed. (No orgId needed; platform is single-tenant. Confirm against schema during implementation.)

```prisma
model VoiceProvider {
  id                    String   @id @default(uuid())
  provider              String   @default("inworld")
  apiKey                String   // encrypted
  isActive              Boolean  @default(true)
  // Turn detection (org-wide)
  inputMode             String   @default("auto") // "tap_to_speak" | "hold_to_speak" | "auto"
  // Always-on sub-config (ignored when inputMode = "hold_to_speak")
  turnMode              String   @default("eagerness") // "trigger" | "eagerness"
  triggerWord           String   @default("transcribe")
  maxSilenceSec         Int      @default(30)          // trigger mode safety valve
  eagernessThresholdSec Int      @default(2)           // eagerness mode (1–5s)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

### Updated: `Agent`

```prisma
voiceEnabled   Boolean @default(false)
voiceId        String? // Inworld voice ID e.g. "Ashley"
voiceTtsModel  String? // "inworld-tts-1.5-max" | "inworld-tts-1.5-mini"
```

---

## Settings — Admin Voice Page

**Route:** `/settings/voice` (Admin only)

**Nav:** New item in Admin section of `SettingsNav` alongside Git, MCP, HQ.

**Sections:**

1. **API Key** — provision/replace Inworld key (masked after save, encrypted at rest). Link to Inworld dashboard for voice design/cloning.
2. **Voice Input Mode** — radio: Tap to speak / Hold to speak / Auto detection
   - **Tap to speak:** tap button to start recording, tap again to stop and send. No further config.
   - **Hold to speak:** hold button while speaking, release ends the turn. No further config.
   - **Auto detection:** mic streams continuously. Sub-option — Turn detection:
     - Trigger word: text input (default "transcribe") + max silence timeout (safety valve)
     - Eagerness: silence threshold selector (1s / 2s / 3s / 5s)

**Wasp additions:**
```wasp
route VoiceSettingsRoute { path: "/settings/voice", to: VoiceSettingsPage }
page VoiceSettingsPage {
  authRequired: true
  component: import { VoiceSettingsPage } from "@src/pages/settings/VoiceSettingsPage"
}
query getVoiceProvider { fn: ..., entities: [VoiceProvider] }
action saveVoiceProvider { fn: ..., entities: [VoiceProvider] }
action deleteVoiceProvider { fn: ..., entities: [VoiceProvider] }
```

---

## Agent Voice Tab

**Location:** New `Voice` tab in `AgentDetailPage`, added to the `tabs` array.

**Component:** `src/pages/agents/tabs/VoiceTab.tsx`

**Contents:**
- Enable voice toggle (`voiceEnabled`)
- Voice picker — dropdown populated by `listVoices` (calls Inworld API live using org key, returns standard + custom workspace voices)
- TTS model selector — "Standard (inworld-tts-1.5-mini)" / "Max quality (inworld-tts-1.5-max)"
- Disabled state with explanation when no `VoiceProvider` is provisioned

**Wasp additions:**
```wasp
query listInworldVoices { fn: ..., entities: [VoiceProvider] }
action updateAgentVoice { fn: ..., entities: [Agent] }
```

---

## Chat Panel — Voice Mode

**Same session, different view.** Voice mode does not create a separate session or buffer messages until call end. Every turn — user transcript and agent response — is written to the session in real-time, exactly as text messages are. The voice UI and the chat UI are two renderers for the same underlying message stream.

- **Chat view:** shows the full message history in the normal bubble layout.
- **Voice view:** shows only the last 2–3 messages as a rolling transcript strip (older messages fade/disappear), with the agent avatar prominent and call-state indicator. Switching between views mid-session is seamless — history is already there.

**Entry point:** A voice mode toggle button in the chat panel (visible only when agent has `voiceEnabled: true` and a `VoiceProvider` exists). Activating voice switches the panel to the voice view; deactivating returns to the chat view. The session and its data do not change.

**UI States:**

| State | Visual | Description |
|-------|--------|-------------|
| Voice off | 🎙 icon | Voice available, not active |
| Listening | 🔴 pulsing | Mic open, streaming audio to server |
| Processing | ⚙️ spinner | Turn detected, ChatRunner running |
| Speaking | 🔊 waveform | TTS audio playing — user can barge in |

**Behaviour:**

**Tap-to-speak mode:**
- User taps button → mic opens, audio streams via `voice:chunk`, button shows active state
- User taps again → `voice:turn_end` sent → server ends STT, runs ChatRunner, saves transcript + response to session, returns `voice:response`
- If user taps while agent is Speaking → immediate barge-in: client stops audio, server aborts TTS, transitions to Listening

**Hold-to-speak mode:**
- User holds button → mic opens, audio streams via `voice:chunk`
- User releases → `voice:turn_end` sent → server ends STT, runs ChatRunner, saves transcript + response to session, returns `voice:response`
- If user holds button while agent is Speaking → immediate barge-in: client stops audio, server aborts TTS, transitions to Listening

**Auto detection mode:**
- Toggle voice mode on → `voice:enter` sent, mic opens continuously, audio streams via `voice:chunk`
- Partial transcripts from `voice:partial` shown live in the rolling transcript strip
- Turn ends via trigger word or silence threshold — server saves to session, sends `voice:response`
- **Barge-in:** audio chunks continue streaming during Speaking; server detects `speech_started` from Inworld STT, aborts TTS, emits `voice:barge_in`, transitions back to Listening

**All modes:**
- Transcript saved to session as user message immediately on turn end; agent response text saved as agent message when ChatRunner completes — both happen in real-time, not on call end
- Audio plays via a stoppable `AudioContext` node (not `<audio>` element — must be interruptible mid-stream)
- Toggle voice mode off → `voice:exit` sent, mic closed, session cleaned up; chat view renders the full history that was already written

**Files:**
- `src/pages/sessions/VoiceButton.tsx` — mic button + state machine
- `src/pages/sessions/VoicePanelView.tsx` — voice view: agent avatar, rolling 2–3 line transcript, call controls
- `src/pages/sessions/useVoiceSession.ts` — hook managing Socket.io voice events and audio capture/playback

---

## Server Voice Handler

**File:** `src/server/voice/voiceHandler.ts`

Registered in the existing Socket.io `webSocketFn`.

**Responsibilities:**
1. On `voice:start`: open Inworld STT WebSocket with org's API key + STT config
2. On `voice:chunk`: forward audio to Inworld STT WebSocket
3. On Inworld partial transcript: check turn detection conditions, emit `voice:partial` to client
4. On turn end: close Inworld STT, pass final transcript to ChatRunner
5. On ChatRunner response: call Inworld TTS, emit `voice:end` with audio + text
6. On `voice:stop` or socket disconnect: clean up Inworld STT connection

**File structure:**
```
src/server/voice/
  voiceHandler.ts       — Socket.io event registration
  voiceRunner.ts        — VoiceRunner: voice system prompt + delegates to agent executor
  inworldAdapter.ts     — InworldVoiceAdapter (STT + TTS calls)
  turnDetection.ts      — silence tracking + trigger word detection
  voiceAdapter.ts       — VoiceAdapter interface
```

---

## Voice-Mode Responses

Voice turns are handled by a dedicated `VoiceRunner` — not ChatRunner. This keeps ChatRunner free of voice-specific flags and conditionals, and gives VoiceRunner a single place to extend voice behaviour in future.

**VoiceRunner responsibilities:**
- Build the voice-optimised system prompt (injected before agent persona)
- Delegate tool execution, MCP calls, skill invocation, and session writes to the same underlying agent executor used by ChatRunner
- Write the user transcript and agent response to the session in real-time (same session, same message store — chat view and voice view are two renderers of the same history)

**File:** `src/server/voice/voiceRunner.ts`

**Voice system prompt block:**

```
[Voice mode]
Respond conversationally — you are speaking aloud, not writing.
- No markdown: no **bold**, no bullet points, no headers, no code blocks
- Short to medium sentences, natural spoken rhythm
- If listing items, use "first... second... and third..." not bullet points
- Keep responses concise — the user is listening, not reading
```

The agent's persona, tools, and reasoning are unaffected — only the output format changes. ChatRunner is not modified.

---

## Server Voice Handler — Barge-in

Audio chunks continue flowing during Speaking state. The server forwards them to a persistent Inworld STT WebSocket. When Inworld STT fires `speech_started`:
1. Abort in-flight Inworld TTS HTTP request (`AbortController` per socket)
2. Emit `voice:barge_in` to client → client stops audio playback immediately
3. Transition server state machine back to Listening
4. Continue processing incoming audio for the new turn

The server must track one `AbortController` per active voice socket for TTS cancellation.

---

## Database Changes

Two schema changes need to be applied via `wasp db migrate-dev`:

1. **New table** — `VoiceProvider` (created by adding the model to `schema.prisma`)
2. **New columns on `Agent`** — `voiceEnabled`, `voiceId`, `voiceTtsModel`

> `wasp db migrate-dev` requires an interactive TTY — run it manually after schema changes are committed. Implementation can proceed against the updated schema before the migration runs locally.

---

## Open Questions (resolved)

- ~~Realtime API vs STT+Agent+TTS~~ → STT+Agent+TTS (agent must retain file/MCP access)
- ~~VoiceRunner vs ChatRunner with isVoiceSession flag~~ → Dedicated VoiceRunner; ChatRunner untouched
- ~~Per-user vs org-wide voice settings~~ → Org-wide (admin), simpler for v1
- ~~Per-agent eagerness~~ → Org-wide default for v1, per-agent override in v2 if needed
- ~~Voice design/cloning in platform~~ → Stays in Inworld dashboard, we just consume voice IDs
