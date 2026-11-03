import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(__dirname, '../../docker/entrypoint.sh')

// `su-exec appuser test -x DIR` answers as a user who is not the owner would: only the other-execute bit counts.
const SU_EXEC = `#!/bin/sh
shift
if [ "$1" = test ] && [ "$2" = -x ]; then [ -n "$(find "$3" -maxdepth 0 -perm -001)" ]; exit; fi
exec "$@"
`

// Folders above the temporary one are the real machine's: the stand-in leaves them alone.
const chmodWithin = (tmp: string) => `#!/bin/sh\ncase "$2" in "${tmp}"/*) exec /bin/chmod "$@" ;; esac\n`

function run(root: string, tmp: string): void {
  const fn = /open_ancestors\(\) \{[\s\S]*?\n\}\n/.exec(fs.readFileSync(SCRIPT, 'utf8'))![0]
  fs.writeFileSync(path.join(tmp, 'su-exec'), SU_EXEC, { mode: 0o755 })
  fs.writeFileSync(path.join(tmp, 'chmod'), chmodWithin(tmp), { mode: 0o755 })
  execFileSync('sh', ['-c', `${fn}\nopen_ancestors "$1"`, 'sh', root], { env: { ...process.env, PATH: `${tmp}:${process.env.PATH}` } })
}

describe('the site image entrypoint, for a data folder under a folder only root can enter', () => {
  it('lets the site user enter every folder above the data folder, as with /root/.agenthix/site/data', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-'))
    const home = path.join(tmp, 'home')
    const data = path.join(home, '.agenthix', 'site', 'data')
    fs.mkdirSync(data, { recursive: true })
    fs.chmodSync(home, 0o700)
    fs.chmodSync(path.join(home, '.agenthix'), 0o700)
    run(data, tmp)
    expect(fs.statSync(home).mode & 0o001).toBe(0o001)
    expect(fs.statSync(path.join(home, '.agenthix')).mode & 0o001).toBe(0o001)
    expect(fs.statSync(home).mode & 0o044).toBe(0)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
