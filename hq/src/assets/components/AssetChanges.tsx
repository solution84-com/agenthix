import { ChangesList, type FileChange } from '@agenthix/ui/files'
import type { FileChangeView } from '../pages/asset/pageTypes'

/** What changed between two versions, file by file, through the one diff renderer (adr-0155). */
export function AssetChanges({ files }: { files: FileChangeView[] }) {
  const changes: FileChange[] = files.map(f => ({ path: f.path, status: f.status, before: f.before, after: f.after, binary: f.binary }))
  return <ChangesList files={changes} />
}
