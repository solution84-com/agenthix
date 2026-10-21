import { useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { useAction, uploadPersonPicture, removePersonPicture } from 'wasp/client/operations'
import { pictureToDataUrl } from './pictureUpload'

/** Changing and removing a person's picture: a hidden file input to click, a busy flag and the last error. */
export function usePictureActions(userId: string): {
  fileRef: RefObject<HTMLInputElement | null>
  choose: () => void
  onFile: (e: ChangeEvent<HTMLInputElement>) => Promise<void>
  remove: () => void
  busy: boolean
  error: string | null
} {
  const upload = useAction(uploadPersonPicture)
  const removePicture = useAction(removePersonPicture)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return {
    fileRef,
    choose: () => fileRef.current?.click(),
    onFile: async e => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      await run(async () => upload({ userId, dataUrl: await pictureToDataUrl(file) }))
    },
    remove: () => void run(() => removePicture({ userId })),
    busy,
    error,
  }
}
