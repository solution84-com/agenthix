/**
 * Backing up without Docker, for tests: databases and storage folders are bytes in memory, and a folder the
 * machine admin names (`/mnt/nas/…`) is a real folder under the test's temporary directory, so what lands in a
 * backup location can be read back as a file.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BackupIO, Bytes, FolderSource } from '../io'

export type FakeBackupIO = BackupIO & {
  databases: Map<string, Buffer>
  folders: Map<string, Buffer>
  started: string[]
  created: string[]
  /** Where a machine path such as `/mnt/nas/x` really is in the test. */
  onMachine: (p: string) => string
  /** Folders that exist but cannot be written. */
  unwritable: Set<string>
  /** A database whose dump fails partway. */
  failDump: Set<string>
}

async function collect(bytes: Bytes): Promise<Buffer> {
  const out: Buffer[] = []
  for await (const b of bytes) out.push(b)
  return Buffer.concat(out)
}

const keyOf = (s: FolderSource) => ('volume' in s ? `volume:${s.volume}` : `path:${s.machinePath}`)

export function fakeBackupIO(root: string): FakeBackupIO {
  const databases = new Map<string, Buffer>()
  const folders = new Map<string, Buffer>()
  const started: string[] = []
  const created: string[] = []
  const unwritable = new Set<string>()
  const failDump = new Set<string>()
  const onMachine = (p: string) => path.join(root, 'machine', p)
  return {
    databases, folders, started, created, onMachine, unwritable, failDump,
    async *dumpDatabase(container, database) {
      yield Buffer.from('PGDMP ')
      if (failDump.has(database)) throw new Error(`pg_dump: connection to ${container} lost`)
      yield databases.get(database) ?? Buffer.from(`rows of ${database}`)
    },
    async restoreDatabase(_container, database, dump) {
      const bytes = await collect(dump)
      databases.set(database, bytes.subarray(6))
    },
    async createProject(project) {
      created.push(project)
    },
    async startServices(project, _file, services) {
      started.push(`${project}:${services.join(',')}`)
    },
    async *readFolder(source) {
      yield folders.get(keyOf(source)) ?? Buffer.from(`files of ${keyOf(source)}`)
    },
    async writeFolder(source, tar) {
      folders.set(keyOf(source), await collect(tar))
    },
    folder: {
      async testWrite(dir) {
        if (!fs.existsSync(onMachine(dir))) return 'missing'
        return unwritable.has(dir) ? 'Permission denied' : null
      },
      async list(dir) {
        return fs.readdirSync(onMachine(dir)).filter(n => fs.statSync(path.join(onMachine(dir), n)).isFile())
          .map(name => ({ name, sizeBytes: fs.statSync(path.join(onMachine(dir), name)).size }))
      },
      async *read(dir, name) {
        yield* fs.createReadStream(path.join(onMachine(dir), name)) as AsyncIterable<Buffer>
      },
      async write(dir, name, bytes) {
        fs.writeFileSync(path.join(onMachine(dir), name), await collect(bytes))
      },
      async remove(dir, name) {
        fs.rmSync(path.join(onMachine(dir), name), { force: true })
      },
    },
  }
}
