// Run as an agent command, through the launcher: swaps a path between a plain
// file (or folder) and a link into the harness home, atomically and as fast as
// it can, for DURATION ms. MODE=file flips /projects/p1/files/race; MODE=dir
// flips the folder /projects/p1/files/out.
import fs from 'node:fs'

const D = '/projects/p1/files'
const end = Date.now() + Number(process.env.DURATION || 30000)
const dir = process.env.MODE === 'dir'
const target = dir ? `${D}/out` : `${D}/race`
let n = 0
while (Date.now() < end) {
  try { fs.rmSync(`${D}/.l`, { force: true }); fs.symlinkSync(dir ? '/home/appuser' : '/home/appuser/secret.txt', `${D}/.l`); fs.renameSync(`${D}/.l`, target) } catch {}
  try {
    fs.rmSync(`${D}/.p`, { recursive: true, force: true })
    if (dir) fs.mkdirSync(`${D}/.p`); else fs.writeFileSync(`${D}/.p`, 'harmless\n')
    if (dir) { fs.rmSync(target, { force: true }); fs.renameSync(`${D}/.p`, target) } else fs.renameSync(`${D}/.p`, target)
  } catch {}
  n++
}
console.log(`flips ${n}`)
