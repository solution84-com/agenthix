/**
 * The Fleet Console's state folder (host-management spec §7): `/state` in its container. It holds the console's
 * keys, its credential to hq, the pinned identities of the machines it manages and the sessions of the people signed
 * in, so everything written there is readable by its owner only.
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

  /** A file's text, or null when it does not exist. */
  readText(...parts: string[]): string | null {
    try {
      return fs.readFileSync(this.path(...parts), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  /** A JSON file's value, or null when it does not exist. A file that is not JSON is an error, never ignored. */
  readJson(...parts: string[]): unknown {
    const file = this.path(...parts)
    const text = this.readText(...parts)
    if (text === null) return null
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${file} is not valid JSON; the Fleet Console will not guess what it held.`)
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
