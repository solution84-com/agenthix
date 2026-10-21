/**
 * The Web Worker both on-device models run in (building-and-testing spec, Models behind narrow interfaces), off the
 * page's main thread. ONNX Runtime Web's WebAssembly build, single-threaded so the page needs no cross-origin
 * isolation; its `.wasm` and both model files are served by hq itself, so nothing is fetched from outside.
 */
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { createModelHost } from './modelHost'
import { checkedModel, SILERO_VAD_FILE, SMART_TURN_FILE, type ModelFile } from './modelFiles'
import { createSileroVad } from './sileroVad'
import { createSmartTurn } from './smartTurn'
import type { ToModels } from './workerProtocol'

ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = { wasm: wasmUrl }

async function session(file: ModelFile): Promise<ort.InferenceSession> {
  const response = await fetch(`/${file.path}`)
  if (!response.ok) throw new Error(`${file.name}: could not be fetched (${response.status})`)
  return ort.InferenceSession.create(await checkedModel(file, new Uint8Array(await response.arrayBuffer())))
}

const handle = createModelHost(
  async () => {
    const [vad, turn] = await Promise.all([session(SILERO_VAD_FILE), session(SMART_TURN_FILE)])
    return { vad: createSileroVad(vad, ort.Tensor), turn: createSmartTurn(turn, ort.Tensor) }
  },
  (message) => self.postMessage(message),
)

self.addEventListener('message', (event: MessageEvent<ToModels>) => handle(event.data))
