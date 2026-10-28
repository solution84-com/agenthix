/** Where a package comes from, as the install operations take it (skills spec part 3 *Sources*; board U4). */
export type PackageFrom =
  | { from: 'shelf'; name: string }
  | { from: 'upload'; zip?: string; folder?: Array<{ path: string; base64: string }>; signature?: string | null }
  | { from: 'url'; link: string }

/** What a person has chosen to upload: a ZIP or a skill folder, and the signature file beside it if it has one. */
export type UploadChoice = { zip: File | null; folder: File[]; signature: File | null }

export const NO_UPLOAD: UploadChoice = { zip: null, folder: [], signature: null }

export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

export const hasUpload = (c: UploadChoice) => c.zip !== null || c.folder.length > 0

/** A folder's file names start with the folder's own name, as the server expects. */
export async function uploadFrom(choice: UploadChoice): Promise<PackageFrom> {
  const signature = choice.signature ? await toBase64(choice.signature) : null
  if (choice.zip) return { from: 'upload', zip: await toBase64(choice.zip), signature }
  const folder = await Promise.all(choice.folder.map(async f => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    base64: await toBase64(f),
  })))
  return { from: 'upload', folder, signature }
}

/** A link is checked on the server; this only keeps an empty field from being sent. */
export const linkReady = (link: string) => link.trim().length > 0
