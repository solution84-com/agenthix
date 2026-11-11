import { useState, type ChangeEvent } from 'react'
import { useAction, importAgent } from 'wasp/client/operations'
import { useAttention } from '../../../shared/components/AttentionDialog'

/** Import: each chosen ZIP is sent as base64, and the person is told what was created, updated or failed. */
export function useImportAgents() {
  const importAgentFn = useAction(importAgent)
  const [importing, setImporting] = useState(false)
  const { show, dialog } = useAttention()

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const files = Array.from(input.files ?? [])
    if (files.length === 0) return
    setImporting(true)
    try {
      const results = await Promise.allSettled(files.map(async file => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        return importAgentFn({ base64: btoa(binary) })
      }))
      // The agents that came in show in the list; only the files that failed need saying.
      const failed = results.flatMap((r, i) => r.status === 'rejected' ? [`${files[i].name}: ${r.reason?.message ?? 'Unknown error'}`] : [])
      if (failed.length > 0) show({ title: failed.length === 1 ? 'That file was not imported' : 'Some files were not imported', text: <ul className="space-y-1">{failed.map(f => <li key={f}>{f}</li>)}</ul> })
    } finally {
      setImporting(false)
      input.value = ''
    }
  }
  return { importing, onFiles, dialog }
}
