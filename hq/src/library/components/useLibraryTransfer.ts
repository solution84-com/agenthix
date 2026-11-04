import { useState } from 'react'
import { useAction, exportLibraryItem } from 'wasp/client/operations'
import type { PackageKind } from '../packages/packageManifest'
import { downloadAgentZip } from '../../agents/pages/manage/downloadAgentZip'

/** Export of library packages (admins): a package is one ZIP, whatever its kind. */
export function useLibraryTransfer() {
  const exportItem = useAction(exportLibraryItem)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  const exportOne = async (kind: PackageKind, id: string) => {
    setMessage(null)
    try { downloadAgentZip(await exportItem({ kind, id })) } catch (err) { setMessage({ text: err instanceof Error ? err.message : 'Export failed', failed: true }) }
  }

  return { message, exportOne }
}
