/**
 * The host service's state folder (host-management spec §6): `/state` in its container, the folder the machine
 * admin's `docker run` names on the machine. It holds every setting and secret of what the host service runs, so
 * everything it writes there is readable by its owner only.
 */
import fs from 'node:fs'
import path from 'node:path'

export class StateFolder {
  constructor(readonly root: string) {}

  /** Makes the folder, private, on first start. */
  prepare(): void {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 })
    fs.chmodSync(this.root, 0o700)
  }

  path(...parts: string[]): string {
    return path.join(this.root, ...parts)
  }

  /** A private sub-folder, made when missing. */
  folder(...parts: string[]): string {
    const dir = this.path(...parts)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    return dir
  }

  /** A JSON file's value, or null when it does not exist. A file that is not JSON is an error, never ignored. */
  readJson(...parts: string[]): unknown {
    const file = this.path(...parts)
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${file} is not valid JSON; the host service will not guess what it held.`)
    }
  }

  /** Writes a file readable by its owner only, replacing it whole so a crash never leaves half of it. */
  writePrivate(parts: string[], content: string): string {
    const file = this.path(...parts)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, content, { mode: 0o600 })
    fs.renameSync(tmp, file)
    fs.chmodSync(file, 0o600)
    return file
  }

  writeJson(parts: string[], value: unknown): string {
    return this.writePrivate(parts, `${JSON.stringify(value, null, 2)}\n`)
  }
}
