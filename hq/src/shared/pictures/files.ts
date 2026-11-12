/** Names of a stored picture's files: `{uuid}.webp` and its small copy `{uuid}-small.webp` beside it. */

const PICTURE_FILE = /^([a-zA-Z0-9_-]+)\.webp$/
const SMALL_SUFFIX = '-small'

/** The small copy's name for a full picture's file name. */
export function smallPictureName(fileName: string): string {
  const match = PICTURE_FILE.exec(fileName)
  if (!match || match[1].endsWith(SMALL_SUFFIX)) throw new Error(`Not a full picture's file name: ${fileName}`)
  return `${match[1]}${SMALL_SUFFIX}.webp`
}

export function isSmallPictureName(fileName: string): boolean {
  const match = PICTURE_FILE.exec(fileName)
  return match !== null && match[1].endsWith(SMALL_SUFFIX)
}
