/**
 * What backing up and restoring asks of the machine, beyond the state folder the host service holds itself:
 * a database's dump, a folder's or volume's contents as a tar stream, and a folder the machine admin chose (the
 * backup location, or where an export goes or is read from). Every one is a fixed Docker action
 * (`docker/docker.ts`'s `DockerStreams`); tests stand in a fake.
 */
import type { DockerStreams } from '../docker/docker'
import type { StateFolder } from '../state/folder'
import { openCloudLocation, routedFolder } from './cloudLocation'

/** Where a folder's contents are: a named volume, or a folder on the machine. */
export type FolderSource = { volume: string } | { machinePath: string }

export type Bytes = AsyncIterable<Buffer>

export interface BackupIO {
  dumpDatabase(container: string, database: string): Bytes
  /** Replaces the database with the dump: dropped, made again, then restored. */
  restoreDatabase(container: string, database: string, dump: Bytes): Promise<void>
  /** Makes the project's containers, networks and volumes without starting them, as compose labels them. */
  createProject(project: string, file: string): Promise<void>
  /** Starts only these services of a compose project, for a restore to write into. */
  startServices(project: string, file: string, services: string[]): Promise<void>
  readFolder(source: FolderSource): Bytes
  /** Replaces the folder's contents with the tar stream's. */
  writeFolder(source: FolderSource, tar: Bytes): Promise<void>
  /** A folder on the machine, as the machine sees it: the backup location, or where an export goes. */
  folder: {
    /** Writes and removes a small file; null when that works, else what failed, in words. */
    testWrite(dir: string): Promise<string | null>
    /** The files directly in it, each with its size. */
    list(dir: string): Promise<{ name: string; sizeBytes: number }[]>
    read(dir: string, name: string): Bytes
    /** Written whole or not at all: to a temporary name, then renamed. */
    write(dir: string, name: string, bytes: Bytes): Promise<void>
    remove(dir: string, name: string): Promise<void>
  }
}

/**
 * A folder a person names, as the machine sees it. Absolute, without `..`, and without the characters that
 * would change what a Docker mount says. Returns what is wrong, or null.
 */
export function folderProblem(dir: string): string | null {
  if (!dir.startsWith('/')) return 'it must be a full path, starting with /'
  if (dir === '/') return 'it cannot be the whole machine'
  if (/[\u0000-\u001f\u007f,"]/.test(dir)) return 'it holds characters a folder name here cannot'
  if (dir.split('/').some(p => p === '..' || p === '.')) return 'it cannot hold . or .. as a folder name'
  if (dir.length > 1024) return 'it is too long'
  return null
}

/**
 * The machine's own: every action through Docker. With the state folder, the backup location Agenthix Cloud sets
 * (cloudLocation.ts) is reached too, through an S3 client made from the credentials kept there.
 */
export function dockerBackupIO(d: DockerStreams, state?: StateFolder): BackupIO {
  const local: BackupIO['folder'] = {
    testWrite: dir => d.testWrite(dir),
    list: dir => d.list(dir),
    read: (dir, name) => d.read(dir, name),
    write: (dir, name, bytes) => d.write(dir, name, bytes),
    remove: (dir, name) => d.remove(dir, name),
  }
  return {
    dumpDatabase: (c, db) => d.dumpDatabase(c, db),
    restoreDatabase: (c, db, dump) => d.restoreDatabase(c, db, dump),
    createProject: (p, f) => d.createProject(p, f),
    startServices: (p, f, s) => d.startServices(p, f, s),
    readFolder: s => d.readFolder(s),
    writeFolder: (s, tar) => d.writeFolder(s, tar),
    folder: state ? routedFolder(local, () => openCloudLocation(state, new Date())) : local,
  }
}
