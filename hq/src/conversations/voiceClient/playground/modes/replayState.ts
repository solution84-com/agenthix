/**
 * What the replay mode shares between its microphone (made when the mode is chosen, opened when voice starts) and
 * the controls it draws: which recording, which optional agent voice, and where the playback is.
 */
export type ReplayStatus = 'idle' | 'loading' | 'playing' | 'finished' | 'stopped' | 'error'

export type ReplayState = {
  /** The recording played in as the microphone, by the name of a file chosen on the page. */
  file: string | null
  /** Optional: a second recording played through the speakers as the agent's own voice. */
  agentFile: string | null
  status: ReplayStatus
  positionMs: number
  totalMs: number
  message: string
}

export type ReplayStore = {
  get: () => ReplayState
  set: (patch: Partial<ReplayState>) => void
  subscribe: (fn: () => void) => () => void
}

export function createReplayStore(): ReplayStore {
  let state: ReplayState = { file: null, agentFile: null, status: 'idle', positionMs: 0, totalMs: 0, message: '' }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch }
      listeners.forEach(fn => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

export const replayStore = createReplayStore()
