// An outside image named in code and in a compose file is one image: the host service runs the code's, and a person
// who runs a compose file runs the file's. The step moves them together; this holds them equal between steps.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { imageRefsOf } from '../images.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter(f => f && fs.lstatSync(path.join(root, f), { throwIfNoEntry: false })?.isFile())
const refs = tracked.flatMap(f => imageRefsOf(f, fs.readFileSync(path.join(root, f), 'utf8')).map(r => ({ ...r, file: f })))
const pins = name => new Set(refs.filter(r => r.name === name).map(r => `${r.tag}@${r.digest}`))

const constant = (file, name) => {
  const m = new RegExp(`${name} = '([^']+)'`).exec(fs.readFileSync(path.join(root, file), 'utf8'))
  assert.ok(m, `${name} is not in ${file}`)
  return m[1]
}

test('every compose file names Postgres as the host service does, by digest', () => {
  const composes = refs.filter(r => r.name === 'postgres' && /compose/.test(r.file)).map(r => r.file)
  assert.deepEqual([...new Set(composes)].sort(), ['docker-compose.yml', 'hq/compose.yml', 'site/compose.yml'])
  assert.deepEqual(pins('postgres'), new Set([constant('host/src/images/published.ts', 'POSTGRES_IMAGE').slice('postgres:'.length)]))
})

test('the front door compose file names Caddy as the host service\'s front door does, by digest', () => {
  assert.ok(refs.some(r => r.name === 'caddy' && r.file === 'front-door/compose.yml'))
  const inCompose = new Set(refs.filter(r => r.name === 'caddy' && r.file === 'front-door/compose.yml').map(r => `${r.tag}@${r.digest}`))
  assert.deepEqual(inCompose, new Set([constant('host/src/frontDoor/config.ts', 'FRONT_DOOR_IMAGE').slice('caddy:'.length)]))
})
