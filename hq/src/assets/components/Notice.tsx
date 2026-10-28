/** A line a screen says after something was done or refused: polite when it worked, an alert when it did not. */
export type NoticeText = { text: string; failed: boolean }

export function Notice({ notice }: { notice: NoticeText | null }) {
  if (!notice) return null
  return <p role={notice.failed ? 'alert' : 'status'} className={`text-small ${notice.failed ? 'text-danger' : 'text-text-secondary'}`}>{notice.text}</p>
}
