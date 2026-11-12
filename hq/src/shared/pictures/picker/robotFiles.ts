/**
 * The robots as files of the picker's own bundle (the spec's *The robots*): the image build puts the checked bundle in
 * `hq/assets/robots/` before the client is built, and Vite emits each picture with the picker's chunk. Where the folder
 * is empty (a fresh clone, the test suites) there are none, and the Robots category is hidden, as on the server.
 */
const files = import.meta.glob('../../../../assets/robots/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>

const byName = new Map(Object.entries(files).map(([file, url]) => [file.slice(file.lastIndexOf('/') + 1, -'.webp'.length), url]))

/** The robots' names, as a recipe holds them. */
export function robotNames(): string[] {
  return [...byName.keys()]
}

/** A robot's picture in the browser, by name; undefined for a name the bundle does not have. */
export function robotUrl(name: string): string | undefined {
  return byName.get(name)
}
