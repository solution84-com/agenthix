/** A refusal from the server in words, as the operations phrase it ("… Nothing was changed."). */
export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-small text-danger">{message}</p>
}
