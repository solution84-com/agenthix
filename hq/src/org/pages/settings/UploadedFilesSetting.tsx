import { useQuery, getEnvStatus } from 'wasp/client/operations'

/** Why uploaded files are downloads only on this HQ, and who can change that (host-management spec §16). */
export function uploadedFilesWords(bareAddress: boolean): { why: string; fix: string } {
  const address = bareAddress
    ? "HQ is reached at a bare network address, which cannot give uploaded files an address of their own."
    : 'HQ has no separate address for uploaded files.'
  return {
    why: `Files people upload are never shown inside HQ. ${address} Shown inline from HQ's own address, a file could act as part of HQ — so attachments and images can be added and downloaded, never opened in place.`,
    fix: "To show them: give HQ a domain with a separate host for files. HQ's machine admin sets it on HQ's machine.",
  }
}

/** Organisation › Settings: HQ's address and how uploaded files are shown. Both are set on HQ's machine; this page only says so. */
export function UploadedFilesSetting() {
  const { data: env } = useQuery(getEnvStatus)
  if (!env) return null
  const downloadsOnly = env.files.mode === 'downloadsOnly'
  const words = uploadedFilesWords(env.files.bareAddress)
  return (
    <section aria-label="Uploaded files" className="mb-6">
      <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Uploaded files</h2>
      <div className="divide-y divide-border-subtle border-y border-border-subtle text-small">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <span className="text-text-muted">HQ's address</span>
          <span className="text-text-primary">{env.address ?? 'Not set'} · set on HQ's machine</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <span className="text-text-muted">Shown as</span>
          <span className="text-text-primary">{downloadsOnly ? 'Downloads only' : env.files.origin}</span>
        </div>
      </div>
      {downloadsOnly && (
        <div className="mt-2 text-small text-text-muted">
          <p>{words.why}</p>
          <p className="mt-1">{words.fix}</p>
        </div>
      )}
    </section>
  )
}
