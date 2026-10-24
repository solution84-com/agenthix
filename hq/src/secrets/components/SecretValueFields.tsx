import { useState } from 'react'
import { FormField, Textarea } from '@agenthix/ui/primitives'
import { bytesToBase64, fileProblem } from '../pages/secretsWords'

export type SecretInput = { kind: 'text'; text: string } | { kind: 'file'; base64: string }

/**
 * The value of a secret: typed text or a file of up to 48 KB, read in the browser and sent once. What is typed stays
 * in this form's state only until it is saved; it is never shown again.
 */
export function SecretValueFields({ name, onChange, error }: {
  name: string
  onChange: (value: SecretInput | null) => void
  error?: string
}) {
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  const pick = (next: 'text' | 'file') => { setMode(next); setFileError(null); setFileName(''); onChange(null) }
  const chooseFile = async (file: File | undefined) => {
    onChange(null)
    setFileError(null)
    setFileName(file?.name ?? '')
    if (!file) return
    const problem = fileProblem(file.size)
    if (problem) { setFileError(problem); return }
    onChange({ kind: 'file', base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) })
  }

  return (
    <FormField label="Value" error={fileError ?? error} hint={mode === 'file'
      ? `A step reads it as /run/secrets/${name || 'NAME'}, byte for byte. Up to 48 KB, the most GitHub accepts. You won't see it again.`
      : 'One line, or many, like a key with its BEGIN and END lines. You won’t see it again.'}>
      <div className="space-y-2">
        <div role="group" aria-label="Kind of value" className="flex gap-1.5">
          {(['text', 'file'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}
              className={`rounded-full px-3 py-1 text-micro font-semibold ${mode === m ? 'bg-accent-subtle text-accent' : 'bg-chip text-text-secondary'}`}>
              {m === 'text' ? 'Text' : 'File'}
            </button>
          ))}
        </div>
        {mode === 'text'
          ? <Textarea aria-label="Value" rows={4} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value ? { kind: 'text', text: e.target.value } : null)} />
          : (
            <div>
              <input aria-label="Value file" type="file" onChange={(e) => void chooseFile(e.target.files?.[0])} className="block w-full text-small text-text-secondary" />
              {fileName && <p className="mt-1 text-micro text-text-muted">{fileName}</p>}
            </div>
          )}
      </div>
    </FormField>
  )
}
