import { useState, type ChangeEvent } from 'react'
import { useAction, exportLibraryItem, importLibraryItem } from 'wasp/client/operations'
import type { PackageKind } from '../packages/packageManifest'
import { downloadAgentZip } from '../../agents/pages/manage/downloadAgentZip'

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Export and Import of library packages (admins): a package is one ZIP, whatever its kind. */
export function useLibraryTransfer(onImported: () => void) {
  const exportItem = useAction(exportLibraryItem)
  const importItem = useAction(importLibraryItem)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  const exportOne = async (kind: PackageKind, id: string) => {
    setMessage(null)
    try { downloadAgentZip(await exportItem({ kind, id })) } catch (err) { setMessage({ text: err instanceof Error ? err.message : 'Export failed', failed: true }) }
  }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return
    setImporting(true)
    setMessage(null)
    const lines: string[] = []
    let failed = false
    for (const file of files) {
      try {
        const made = await importItem({ base64: await toBase64(file) })
        lines.push(`${made.name} imported`)
      } catch (err) {
        failed = true
        lines.push(`${file.name}: ${err instanceof Error ? err.message : 'could not be imported'}`)
      }
    }
    setMessage({ text: lines.join(' · '), failed })
    setImporting(false)
    onImported()
  }

  return { importing, message, exportOne, onFiles }
}
