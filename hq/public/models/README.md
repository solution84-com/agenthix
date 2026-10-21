# The on-device voice models

Voice runs two small models in the person's browser, in a Web Worker, with ONNX Runtime Web
(`hq/src/conversations/voiceClient/models/`). hq serves their files from here, so a self-hosted HQ fetches nothing
from outside at run time; ONNX Runtime Web's own `.wasm` comes from the `onnxruntime-web` package and is emitted
into hq's client build. The worker checks each file's SHA-256 against `modelFiles.ts` before loading it.

| File | Model | Source | Version | Licence | SHA-256 |
|---|---|---|---|---|---|
| `silero-vad/silero_vad.onnx` | Silero VAD, voice activity detection: one 32 ms frame in, the confidence that it holds a voice out | [snakers4/silero-vad](https://github.com/snakers4/silero-vad), `src/silero_vad/data/silero_vad.onnx` at tag `v6.2.3` | v6.2.3 | MIT, `silero-vad/LICENSE` | `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3` |
| `smart-turn/smart-turn-v3.2-cpu.onnx` | Smart Turn, turn detection: up to 8 s of audio in, the probability that the turn is finished out | [pipecat-ai/smart-turn-v3](https://huggingface.co/pipecat-ai/smart-turn-v3) on Hugging Face, revision `f766f81d3cfdf7737ac64aad813d91bbfd56bf93`; code at [pipecat-ai/smart-turn](https://github.com/pipecat-ai/smart-turn) | v3.2, the CPU build (int8, about 8 MB) | BSD 2-Clause, `smart-turn/LICENSE` | `2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f` |

**Updating a model:** replace the file, record its source, version and SHA-256 here and in `modelFiles.ts`, and
run hq's unit tests: the model contract tests in `voiceClient/models/__tests__/` score both models against the
upstream reference's numbers and against labelled clips, so a model that behaves differently fails them.
