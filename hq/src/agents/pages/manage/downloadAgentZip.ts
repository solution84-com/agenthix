/** Saves the ZIP an export returns, as the browser downloads a file. */
export function downloadAgentZip({ base64, filename }: { base64: string; filename: string }): void {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
