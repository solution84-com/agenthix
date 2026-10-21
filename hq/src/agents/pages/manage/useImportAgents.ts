import { useState, type ChangeEvent } from 'react'
import { useAction, importAgent } from 'wasp/client/operations'

/** Import: each chosen ZIP is sent as base64, and the person is told what was created, updated or failed. */
export function useImportAgents() {
  const importAgentFn = useAction(importAgent)
  const [importing, setImporting] = useState(false)

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
      const lines = results.map(r => r.status === 'fulfilled'
        ? `@${r.value.handle} ${r.value.created ? 'created' : 'updated'}`
        : `Failed: ${r.reason?.message ?? 'Unknown error'}`)
      alert(lines.join('\n'))
    } finally {
      setImporting(false)
      input.value = ''
    }
  }
  return { importing, onFiles }
}
