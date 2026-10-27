/**
 * hq's storage folder as the relay sees it mounted, made in a temporary folder: a few uploads in their places, a
 * secret beside the folder, and the ways out an attacker would plant — a link to a file, a link to a folder, a hard
 * link.
 */
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileVersion } from '@agenthix/core'

export type UploadsOnDisk = { base: string; root: string; version(uploadPath: string): string; remove(): void }

/** Where an upload path lives in the folder: the task attachments under `tasks/`, every other path as it reads. */
const onDisk = (root: string, uploadPath: string) =>
  path.join(root, uploadPath.replace(/^\/files\/task\//, '/tasks/'))

export function makeUploadsOnDisk(): UploadsOnDisk {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'relay-uploads-')))
  const root = path.join(base, 'storage')
  const put = (rel: string, content: string | Buffer) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), content)
  }
  put('tasks/t1/a1/notes.txt', 'hello upload')
  put('tasks/t1/a1/report.pdf', '%PDF-1.4 not really')
  put('tasks/t1/a1/sub/deep.md', '# deep')
  put('agents/ag1/images/face.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  put('org/images/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]))
  put('models/weights.bin', 'not an upload')
  mkdirSync(path.join(root, 'tasks/t1/a1/folder.txt'), { recursive: true })

  writeFileSync(path.join(base, 'secret.txt'), 'the secret')
  mkdirSync(path.join(base, 'outside/images'), { recursive: true })
  writeFileSync(path.join(base, 'outside/images/x.png'), 'outside picture')
  symlinkSync(path.join(base, 'secret.txt'), path.join(root, 'tasks/t1/a1/link.txt'))
  symlinkSync('notes.txt', path.join(root, 'tasks/t1/a1/inside-link.txt'))
  mkdirSync(path.join(root, 'people'), { recursive: true })
  symlinkSync(path.join(base, 'outside'), path.join(root, 'people/p1'))
  mkdirSync(path.join(root, 'tasks/t2'), { recursive: true })
  symlinkSync(path.join(root, 'tasks/t1'), path.join(root, 'tasks/t2/a1'))
  linkSync(path.join(base, 'secret.txt'), path.join(root, 'tasks/t1/a1/hard.txt'))

  return {
    base,
    root,
    version(uploadPath) {
      const st = statSync(onDisk(root, uploadPath))
      return fileVersion(st.size, st.mtimeMs)
    },
    remove: () => rmSync(base, { recursive: true, force: true }),
  }
}
