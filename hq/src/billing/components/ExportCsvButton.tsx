import { useState } from 'react'
import { api } from 'wasp/client/api'
import { Button } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

/** The export needs the sign-in header, so the file is fetched and saved from here rather than linked. */
export function ExportCsvButton({ month, billingProfileId }: { month: string; billingProfileId: string }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const exportIt = async () => {
    setBusy(true)
    setProblem('')
    try {
      const blob = await api.get('api/v1/usage/export', { searchParams: { month, ...(billingProfileId ? { profile: billingProfileId } : {}) } }).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `usage-${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setProblem('The export did not finish. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="text-right">
      <Button variant="secondary" disabled={busy} onClick={() => void exportIt()}>{busy ? 'Exporting…' : 'Export CSV'}</Button>
      <ShowAttention text={problem} title="The export failed" onClose={() => setProblem('')} />
    </div>
  )
}
