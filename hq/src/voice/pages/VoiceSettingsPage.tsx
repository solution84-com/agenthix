import { useQuery, useAction } from 'wasp/client/operations'
import { getVoiceProvider, saveVoiceProvider, deleteVoiceProvider } from 'wasp/client/operations'
import { useState, useEffect } from 'react'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { BRANDING } from '@agenthix/core'

interface AssemblyAiConfig {
  speech_model: string
  format_turns: boolean
  keyterms_prompt: string   // comma-separated in UI, stored as array
  prompt: string
  speaker_labels: boolean
  language_detection: boolean
}

const DEFAULT_ASSEMBLYAI_CONFIG: AssemblyAiConfig = {
  speech_model: 'u3-rt-pro',
  format_turns: true,
  keyterms_prompt: '',
  prompt: '',
  speaker_labels: false,
  language_detection: false,
}

function configFromRecord(record: any): AssemblyAiConfig {
  const c = record?.config ?? {}
  return {
    speech_model: c.speech_model ?? DEFAULT_ASSEMBLYAI_CONFIG.speech_model,
    format_turns: c.format_turns ?? DEFAULT_ASSEMBLYAI_CONFIG.format_turns,
    keyterms_prompt: Array.isArray(c.keyterms_prompt) ? c.keyterms_prompt.join(', ') : (c.keyterms_prompt ?? ''),
    prompt: c.prompt ?? '',
    speaker_labels: c.speaker_labels ?? false,
    language_detection: c.language_detection ?? false,
  }
}

function configToRecord(cfg: AssemblyAiConfig): Record<string, unknown> {
  return {
    speech_model: cfg.speech_model,
    format_turns: cfg.format_turns,
    keyterms_prompt: cfg.keyterms_prompt
      ? cfg.keyterms_prompt.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    prompt: cfg.prompt,
    speaker_labels: cfg.speaker_labels,
    language_detection: cfg.language_detection,
  }
}

const inputCls = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-text-primary text-body focus:outline-none focus:border-accent transition-colors'
const labelCls = 'block text-text-secondary text-small mb-1'

function ToggleField({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-text-primary text-body">{label}</div>
        {description && <div className="text-text-muted text-small mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? 'bg-accent' : 'bg-surface-3'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-on-accent shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function AssemblyAiConfigForm({ config, onChange }: {
  config: AssemblyAiConfig
  onChange: (cfg: AssemblyAiConfig) => void
}) {
  const set = <K extends keyof AssemblyAiConfig>(key: K, val: AssemblyAiConfig[K]) =>
    onChange({ ...config, [key]: val })

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <p className="text-text-secondary text-small font-medium">STT Config</p>

      <div>
        <label className={labelCls}>Speech Model</label>
        <select
          value={config.speech_model}
          onChange={e => set('speech_model', e.target.value)}
          className={inputCls}
        >
          <option value="u3-rt-pro">u3-rt-pro (Universal-3 Pro)</option>
          <option value="universal-streaming-english">universal-streaming-english</option>
          <option value="universal-streaming-multilingual">universal-streaming-multilingual</option>
          <option value="whisper-rt">whisper-rt</option>
        </select>
      </div>

      <ToggleField
        label="Format Turns"
        description="Add punctuation and capitalisation to final transcripts. Slight latency increase."
        value={config.format_turns}
        onChange={v => set('format_turns', v)}
      />

      <div>
        <label className={labelCls}>Key Terms (comma-separated)</label>
        <input
          type="text"
          value={config.keyterms_prompt}
          onChange={e => set('keyterms_prompt', e.target.value)}
          placeholder={`${BRANDING.displayName}, kernel agent, ...`}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Model Prompt (context hint)</label>
        <textarea
          value={config.prompt}
          onChange={e => set('prompt', e.target.value)}
          rows={2}
          placeholder="Optional context for the transcription model..."
          className={`${inputCls} resize-none`}
        />
      </div>

      <div className="space-y-3">
        <ToggleField
          label="Speaker Labels"
          description="Enable diarization -- identify individual speakers."
          value={config.speaker_labels}
          onChange={v => set('speaker_labels', v)}
        />
        <ToggleField
          label="Language Detection"
          description="Return language code and confidence in each transcript turn."
          value={config.language_detection}
          onChange={v => set('language_detection', v)}
        />
      </div>
    </div>
  )
}

type ProviderSectionProps = {
  title: string
  service: 'stt' | 'tts'
  providerName: string
  record: { id: string; apiKeyPrefix: string; config: any; isEnabled: boolean } | null
  onSave: (apiKey: string, config?: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
  showConfig?: boolean
}

function ProviderSection({ title, service, providerName, record, onSave, onDelete, showConfig }: ProviderSectionProps) {
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sttConfig, setSttConfig] = useState<AssemblyAiConfig>(DEFAULT_ASSEMBLYAI_CONFIG)

  useEffect(() => {
    if (record?.config) setSttConfig(configFromRecord(record))
  }, [record?.id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(apiKey, showConfig ? configToRecord(sttConfig) : undefined)
      setApiKey('')
      setEditing(false)
      setSuccess('Saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveConfigOnly = async () => {
    if (!record) return
    setSaving(true)
    setError(null)
    try {
      await onSave('__keep__', configToRecord(sttConfig))
      setSuccess('Config saved')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Remove ${title} API key? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-text-primary font-medium">{title}</h3>
          {record ? (
            <p className="text-text-muted text-small mt-0.5">
              Key: {record.apiKeyPrefix} · {record.isEnabled ? <span className="text-success">Active</span> : <span className="text-text-muted">Disabled</span>}
            </p>
          ) : (
            <p className="text-text-muted text-small mt-0.5">Not configured</p>
          )}
        </div>
        <div className="flex gap-2">
          {success && <span className="text-success text-small self-center">{success}</span>}
          {record && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-text-muted hover:text-danger text-body transition-colors cursor-pointer"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </button>
          )}
          <button
            onClick={() => setEditing(e => !e)}
            className="bg-surface-2 hover:bg-surface-3 text-text-secondary px-3 py-1.5 rounded-lg text-body transition-colors cursor-pointer"
          >
            {record ? 'Replace key' : 'Add key'}
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className={labelCls}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              required
              placeholder="Paste API key..."
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer"
            >
              {saving ? 'Verifying & saving…' : 'Save Key'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null) }}
              className="bg-surface-2 hover:bg-surface-3 text-text-secondary px-4 py-2 rounded-lg text-body transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-danger text-small whitespace-pre-wrap break-words">{error}</p>
          )}
        </form>
      )}

      {showConfig && record && (
        <>
          <AssemblyAiConfigForm config={sttConfig} onChange={setSttConfig} />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveConfigOnly}
              disabled={saving}
              className="bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Config'}
            </button>
          </div>
          {error && !editing && (
            <p className="text-danger text-small mt-2 whitespace-pre-wrap break-words">{error}</p>
          )}
        </>
      )}
    </div>
  )
}

/** Organisation › Settings › Voice: the organisation's speech providers. */
export function VoiceSettingsPage() {
  return (
    <OrgAdminPage area="settings" title="Voice" wide>
      <OrgAdminHeading title="Voice">Speech to text and text to speech providers for voice conversations.</OrgAdminHeading>
      <VoiceProviders />
    </OrgAdminPage>
  )
}

function VoiceProviders() {
  const { data: providers, refetch } = useQuery(getVoiceProvider)
  const saveVoiceProviderFn = useAction(saveVoiceProvider)
  const deleteVoiceProviderFn = useAction(deleteVoiceProvider)

  const handleSave = (service: 'stt' | 'tts', name: string) =>
    async (apiKey: string, config?: Record<string, unknown>) => {
      await saveVoiceProviderFn({ service, name, apiKey, config })
      refetch()
    }

  const handleDelete = (service: 'stt' | 'tts', name: string) => async () => {
    await deleteVoiceProviderFn({ service, name })
    refetch()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2 font-medium text-text-secondary mb-3">Speech-to-Text</h2>
        <ProviderSection
          title="AssemblyAI"
          service="stt"
          providerName="assemblyai"
          record={providers?.assemblyai ?? null}
          onSave={handleSave('stt', 'assemblyai')}
          onDelete={handleDelete('stt', 'assemblyai')}
          showConfig
        />
      </div>

      <div>
        <h2 className="text-h2 font-medium text-text-secondary mb-3">Text-to-Speech</h2>
        <ProviderSection
          title="Inworld"
          service="tts"
          providerName="inworld"
          record={providers?.inworld ?? null}
          onSave={handleSave('tts', 'inworld')}
          onDelete={handleDelete('tts', 'inworld')}
        />
      </div>
    </div>
  )
}
