import type { ChangeEvent } from 'react'
import { NO_UPLOAD, type UploadChoice } from './packageSource'

const FIELD = 'mt-1 block w-full text-small text-text-secondary file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-1 file:px-3 file:py-1 file:text-small file:text-text-primary'

/**
 * Choosing a package to upload: a ZIP, or a skill folder, with its signature file when it has one (board U4). A
 * package without a signature file is unsigned, and the check says so.
 */
export function PackagePicker({ value, onChange }: { value: UploadChoice; onChange: (next: UploadChoice) => void }) {
  const zip = (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, zip: e.target.files?.[0] ?? null, folder: [] })
  const folder = (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, folder: Array.from(e.target.files ?? []), zip: null })
  const signature = (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, signature: e.target.files?.[0] ?? null })
  return (
    <div className="space-y-3">
      <label className="block text-small text-text-secondary">A package (ZIP)
        <input type="file" accept=".zip,application/zip" onChange={zip} className={FIELD} data-testid="upload-zip" />
      </label>
      <label className="block text-small text-text-secondary">Or a skill folder, with its SKILL.md
        <input type="file" onChange={folder} className={FIELD} data-testid="upload-folder" {...{ webkitdirectory: '', directory: '' }} multiple />
      </label>
      <label className="block text-small text-text-secondary">Its signature file, if it has one (package.sigstore.json)
        <input type="file" accept=".json,application/json" onChange={signature} className={FIELD} data-testid="upload-signature" />
      </label>
      {(value.zip || value.folder.length > 0 || value.signature) && (
        <button type="button" onClick={() => onChange(NO_UPLOAD)} className="text-small text-text-muted hover:text-text-primary">Clear</button>
      )}
    </div>
  )
}
