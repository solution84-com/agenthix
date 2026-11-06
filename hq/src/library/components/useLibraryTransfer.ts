import { useAction, exportLibraryItem } from 'wasp/client/operations'
import type { PackageKind } from '../packages/packageManifest'
import { downloadAgentZip } from '../../agents/pages/manage/downloadAgentZip'
import { useAttention } from '../../shared/components/AttentionDialog'

/**
 * Export of library packages (admins): a package is one ZIP, whatever its kind. A failure opens the attention dialog
 * (render `dialog` once) with Try again; a download the browser shows gets no message.
 */
export function useLibraryTransfer() {
  const exportItem = useAction(exportLibraryItem)
  const { show, dialog } = useAttention()

  const exportOne = async (kind: PackageKind, id: string): Promise<void> => {
    try {
      downloadAgentZip(await exportItem({ kind, id }))
    } catch (err) {
      show({ title: 'It could not be downloaded', text: err instanceof Error ? err.message : 'The package could not be made. Nothing was changed.', retry: () => void exportOne(kind, id) })
    }
  }

  return { dialog, exportOne }
}
