// Prints, as JSON, every entry under a folder inside the container: a folder,
// a link and where it points, or a file's mode and contents (text if it is
// UTF-8, otherwise base64). Used to compare what two tools left on disk.
//   node snapshot.mjs /projects/p1/files/cmp
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const out = {}

function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name)
    const rel = path.relative(root, full)
    const st = fs.lstatSync(full)
    if (st.isSymbolicLink()) out[rel] = `link -> ${fs.readlinkSync(full)}`
    else if (st.isDirectory()) { out[rel] = 'folder'; walk(full) }
    else {
      const mode = (st.mode & 0o777).toString(8)
      let body
      try {
        const bytes = fs.readFileSync(full)
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
        body = `text ${JSON.stringify(text)}`
      } catch (err) {
        body = err.code ? `unreadable ${err.code}` : `base64 ${fs.readFileSync(full).toString('base64')}`
      }
      out[rel] = `file ${mode} ${body}`
    }
  }
}

if (fs.existsSync(root)) walk(root)
process.stdout.write(JSON.stringify(out))
