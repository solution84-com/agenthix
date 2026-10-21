---
name: Adaptive voice — Acoustic
description: How voice hears the person and adapts to the room: native clean-up, silence detection with Silero VAD, and the settings that adapt to the room and to echo.
created: 2026-10-19
author: leang
---

# Acoustic · perception and adaptation

Part of the adaptive voice spec: the [overview](../spec.md) holds the purpose, the outline of the four layers,
the models, the measurements and the decisions.


Hears the person, and adapts to where they are. Two parts: **the audio path** runs one way, continuously, from the
microphone to STT; **settings**, Acoustic's own job, read the same audio and what is being played and change how the audio
that follows is handled. Nothing already sent is touched.

**The audio path**

1. **Native clean-up.** The device's own echo cancellation and noise suppression, preferred wherever it is
   effective: in a browser, the microphone is opened with `echoCancellation`, `noiseSuppression` and
   `autoGainControl` on. One output, the clean audio, which goes on to STT.
2. **Silence detection.** A voice activity detection model on the device: [Silero VAD](https://github.com/snakers4/silero-vad)
   to start with (open source, MIT licence, about 2 MB), run in the page with ONNX Runtime Web. Every 32 ms it scores
   the latest slice of clean audio with a **confidence** from 0 (sure there is no voice) to 1 (sure there is one); a
   probability, not loudness. Four **detector settings** turn the confidences into **silence: no** and **silence: yes**:

   | Setting | What it decides | Starting value |
   |---|---|---|
   | On threshold | How confident the model must be for a slice to count as voice | 0.5 |
   | Off threshold | How unconfident before a slice counts as no voice; lower than the on threshold, so voice does not flicker off mid-word | 0.35 |
   | Minimum voice | How long voice must last before **silence: no**; a cough or a click does not count | 250 ms |
   | Minimum silence | How long silence must last before **silence: yes**; only the gap between words, since whether a pause ends the turn is Semantics' decision | 100–200 ms |

   **Level gates.** Measured on recordings, Silero scores the agent's own voice leaking back, and another person
   talking nearby, as confidently as the person: no threshold tells them apart. So silence detection also gates on
   loudness. While the agent plays, a frame counts as voice only at 2.5 times the echo expected: the loudest of what
   playback sent in the last half second, times the echo path's gain, learned from the microphone's level over
   playback's while the agent speaks. In a room of other voices, a frame counts as voice only at 3 times the room's
   median loudness over the last 6 s, with the agent's audio left out.

   The starting values are Silero's defaults; measurement sets the real ones. **Silence: no** (someone started speaking) goes to Orchestration;
   **silence: yes** goes to Semantics. WebRTC VAD and TEN VAD are benchmarked against it, and the smallest that meets the
   measured quality is chosen.

**Settings**

3. **Device check.** At the start, and whenever the microphone changes: which microphone, headphones or speakers, and
   which processing the device actually granted.
4. **Room monitor.** Reads the clean audio over several seconds and labels the room's *condition*, not the place:
   **quiet, steady noise, intermittent noise, competing speech, wind or unstable**. The label also goes to the
   measurements, so it is known which conditions voice fails in.
5. **Adapter.** When the label changes, it changes the settings for the audio that follows, and keeps reassessing
   whether each change improved what is captured, putting it back if not. Mostly the detector settings: for example
   0.5 held for 250 ms in a quiet room; while the agent is speaking, when its echo can leak back, 0.7 held for 300 ms,
   so echo stays off and the person still ends the silence; with bursts of noise, a longer minimum voice. Beyond those,
   the speech service's sensitivity on its next connection, the device's processing on or off, and telling the
   person the room is too noisy, with headphones suggested.
6. **Echo check** (our code, no model). Compares what the microphone hears with what is being played, slightly
   delayed, and works out how much of the incoming sound is the agent's own voice leaking back past the device's echo
   cancellation. It runs for a few seconds the first time the agent speaks, which shows how well this device cancels
   echo, and then all the time while the agent speaks. Its echo level goes to the Adapter: strict detector settings
   when a lot leaks, normal when little does, and the headphones suggestion when it is high. A second echo canceller
   in the page (the open Speex canceller in WebAssembly, or a small neural one) is considered only if measurement
   shows the device's cancellation is not good enough.
7. **Telling the person's voice from others** is optional. An enrolled speaker profile, or extraction of one target
   speaker, is a privacy-sensitive last resort and never part of the baseline.
