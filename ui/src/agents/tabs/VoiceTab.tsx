import { useState, useRef, useEffect } from 'react'
import type { AgentDetail } from '../types'
import { matchesVoiceSearch, voiceAccents, voiceGender, type VoiceGender } from './voiceFilters'

export interface VoiceProvider { provider: string | null }
export interface InworldVoice {
  voiceId: string
  displayName: string
  description: string
  languages: string[]
  tags?: string[]
}

export interface VoiceTabQueries {
  getVoiceProvider: () => Promise<VoiceProvider | null>
  listInworldVoices: () => Promise<InworldVoice[]>
}

export interface VoiceTabActions {
  updateAgentVoice: (input: { agentId: string; voiceEnabled?: boolean; voiceId?: string | null; voiceTtsModel?: string | null }) => Promise<unknown>
  previewVoice: (input: { voiceId: string; description: string; lang: string; model: string }) => Promise<{ audio: string }>
}

export interface VoiceTabProps {
  agent: Pick<AgentDetail, 'id' | 'voiceEnabled' | 'voiceId' | 'voiceTtsModel'>
  queries: VoiceTabQueries
  actions: VoiceTabActions
  onSaved?: () => void
}

const TTS_MODELS = [
  { value: 'inworld-tts-2', label: 'Natural (inworld-tts-2)' },
  { value: 'inworld-tts-1.5-mini', label: 'Standard (inworld-tts-1.5-mini)' },
  { value: 'inworld-tts-1.5-max', label: 'Max quality (inworld-tts-1.5-max)' },
]

const LANG_LABELS: Record<string, string> = {
  ar: 'Arabic', de: 'German', en: 'English', es: 'Spanish', fr: 'French',
  he: 'Hebrew', hi: 'Hindi', it: 'Italian', ja: 'Japanese', ko: 'Korean',
  nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
}

const AVATAR_COLORS = [
  '#3a6aaa', '#6a3aaa', '#3aaa6a', '#aa6a3a', '#aa3a6a',
  '#6aaa3a', '#3aaaaa', '#aa3aaa', '#5a7aaa', '#7a5aaa',
]

function avatarColor(voiceId: string): string {
  let hash = 0
  for (let i = 0; i < voiceId.length; i++) hash = (hash * 31 + voiceId.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function decodePcm16(base64: string): { ctx: AudioContext; src: AudioBufferSourceNode } {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  const samples = new Int16Array(bytes.buffer)
  const ctx = new AudioContext({ sampleRate: 24000 })
  const buf = ctx.createBuffer(1, samples.length, 24000)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768
  const gain = ctx.createGain()
  const duration = buf.duration
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.03)
  gain.gain.setValueAtTime(1, ctx.currentTime + duration - 0.03)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(gain)
  gain.connect(ctx.destination)
  return { ctx, src }
}

export function VoiceTab({ agent, queries, actions, onSaved }: VoiceTabProps) {
  const [provider, setProvider] = useState<VoiceProvider | null>(null)
  const [voices, setVoices] = useState<InworldVoice[] | null>(null)

  useEffect(() => {
    queries.getVoiceProvider().then(setProvider).catch(() => setProvider(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!provider) return
    queries.listInworldVoices().then(setVoices).catch(() => setVoices([]))
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  const [voiceEnabled, setVoiceEnabled] = useState(agent.voiceEnabled)
  const [voiceId, setVoiceId] = useState(agent.voiceId ?? '')
  const [voiceTtsModel, setVoiceTtsModel] = useState(agent.voiceTtsModel ?? 'inworld-tts-2')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState<VoiceGender | ''>('')
  const [accentFilter, setAccentFilter] = useState('')
  const [phraseLang, setPhraseLang] = useState('en')
  const audioCache = useRef<Map<string, string>>(new Map())
  const audioRef = useRef<{ src: AudioBufferSourceNode; ctx: AudioContext } | null>(null)

  const hasProvider = !!provider

  async function handlePreview(id: string, description: string) {
    if (audioRef.current) {
      try { audioRef.current.src.stop() } catch {}
      audioRef.current.ctx.close()
      audioRef.current = null
    }
    setPlayingId(id)
    try {
      const cacheKey = `${id}:${phraseLang}:${voiceTtsModel}`
      let cached = audioCache.current.get(cacheKey)
      if (!cached) {
        const result = await actions.previewVoice({ voiceId: id, description, lang: phraseLang, model: voiceTtsModel })
        cached = result.audio
        audioCache.current.set(cacheKey, cached)
      }
      const { ctx, src } = decodePcm16(cached)
      audioRef.current = { ctx, src }
      await new Promise<void>(resolve => {
        src.onended = () => {
          ctx.close()
          if (audioRef.current?.src === src) audioRef.current = null
          resolve()
        }
        src.start()
      })
    } catch {
      // silently ignore preview errors
    } finally {
      setPlayingId(prev => prev === id ? null : prev)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await actions.updateAgentVoice({
        agentId: agent.id,
        voiceEnabled,
        voiceId: voiceId || null,
        voiceTtsModel: voiceTtsModel || null,
      })
      setSuccess(true)
      onSaved?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!hasProvider) {
    return (
      <div className="p-6 rounded-xl border border-border bg-surface-1 text-center">
        <p className="text-body text-text-secondary mb-2">No voice provider is configured.</p>
        <p className="text-small text-text-muted">
          An admin must provision an Inworld API key at{' '}
          <a href="/org/settings/voice" className="text-accent underline">Organisation › Settings › Voice</a> to enable voice mode.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border">
        <div>
          <p className="text-body font-medium text-text-primary">Enable voice mode</p>
          <p className="text-small text-text-secondary mt-0.5">Show mic button in this agent's chat panel</p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceEnabled(v => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${voiceEnabled ? 'bg-accent' : 'bg-surface-3'}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-on-accent shadow transition-all duration-200 ${voiceEnabled ? 'left-[22px]' : 'left-0.5'}`}
          />
        </button>
      </div>

      {voiceEnabled && (
        <>
          {/* TTS model */}
          <div>
            <label className="block text-small text-text-secondary mb-1">TTS model</label>
            <select
              value={voiceTtsModel}
              onChange={e => { setVoiceTtsModel(e.target.value); audioCache.current.clear() }}
              className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50"
            >
              {TTS_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Voice grid */}
          <div>
            <label className="block text-small text-text-secondary mb-3">Voice</label>
            {!voices ? (
              <p className="text-small text-text-muted">Loading voices…</p>
            ) : (() => {
              const availableLangs = [...new Set(voices.flatMap(v => v.languages))].sort()
              const availableAccents = [...new Set(voices.flatMap(voiceAccents))].sort()
              const filtered = voices.filter(v =>
                (!langFilter || v.languages.includes(langFilter)) &&
                (!genderFilter || voiceGender(v) === genderFilter) &&
                (!accentFilter || voiceAccents(v).includes(accentFilter)) &&
                matchesVoiceSearch(v, search)
              )
              return (
              <>
                {/* Filters */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search voices, e.g. british male calm"
                    aria-label="Search voices"
                    className="min-w-48 flex-1 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                  />
                  <select
                    value={langFilter}
                    onChange={e => setLangFilter(e.target.value)}
                    className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-body text-text-primary focus:outline-none focus:border-accent/50"
                  >
                    <option value="">All languages</option>
                    {availableLangs.map(l => (
                      <option key={l} value={l}>{LANG_LABELS[l] ?? l}</option>
                    ))}
                  </select>
                  <select
                    value={accentFilter}
                    onChange={e => setAccentFilter(e.target.value)}
                    aria-label="Accent"
                    className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-body text-text-primary focus:outline-none focus:border-accent/50"
                  >
                    <option value="">All accents</option>
                    {availableAccents.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <select
                    value={genderFilter}
                    onChange={e => setGenderFilter(e.target.value as VoiceGender | '')}
                    aria-label="Gender"
                    className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-body text-text-primary focus:outline-none focus:border-accent/50"
                  >
                    <option value="">Any gender</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                  <select
                    value={phraseLang}
                    onChange={e => { setPhraseLang(e.target.value); audioCache.current.clear() }}
                    title="Language for preview phrase"
                    className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-body text-text-primary focus:outline-none focus:border-accent/50"
                  >
                    {availableLangs.map(l => (
                      <option key={l} value={l}>{LANG_LABELS[l] ?? l} phrase</option>
                    ))}
                  </select>
                </div>

                {filtered.length === 0 ? (
                  <p className="text-small text-text-muted">No voices match your filters.</p>
                ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                {filtered.map(v => {
                  const selected = voiceId === v.voiceId
                  const playing = playingId === v.voiceId
                  return (
                    <div
                      key={v.voiceId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setVoiceId(v.voiceId)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setVoiceId(v.voiceId)
                        }
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-surface-1 hover:border-border hover:bg-surface-hover'
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-on-accent font-semibold text-body"
                        style={{ background: avatarColor(v.voiceId) }}
                      >
                        {v.displayName.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium text-text-primary truncate">{v.displayName}</p>
                        <p className="text-small text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">{v.description}</p>
                      </div>

                      {/* Play button */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handlePreview(v.voiceId, v.description) }}
                        title="Preview voice"
                        className="flex-shrink-0 w-7 h-7 rounded-full bg-surface-3 hover:bg-surface-hover flex items-center justify-center transition-colors mt-1"
                      >
                        {playing ? (
                          <span className="flex gap-0.5 items-end h-3">
                            <span className="w-0.5 h-2 bg-accent rounded-full animate-pulse" />
                            <span className="w-0.5 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                            <span className="w-0.5 h-1.5 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                          </span>
                        ) : (
                          <svg className="w-3 h-3 text-text-secondary ml-0.5" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M4 2l10 6-10 6V2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
                </div>
                )}
              </>
              )
            })()}
          </div>
        </>
      )}

      {error && <p className="text-small text-danger">{error}</p>}
      {success && <p className="text-small text-success">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-accent hover:bg-accent/90 disabled:opacity-50 text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
