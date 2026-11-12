// node --test scripts/robots/__tests__/robots.test.mjs
// The robots bundle: packed, checked and installed, and refused when anything about it is not the pinned bundle.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import zlib from 'node:zlib'
import { sha256 } from '../bundle.mjs'
import { install } from '../fetch.mjs'
import { packBundle } from '../pack.mjs'
import { packTar, unpackTar } from '../tar.mjs'

const webp = (text) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.from(text)])

function originals() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robots-src-'))
  fs.writeFileSync(path.join(dir, 'a-long-planner-name.webp'), webp('planner'))
  fs.writeFileSync(path.join(dir, 'kernel-avatar.webp'), webp('kernel'))
  return dir
}

const NAMES = {
  bundle: 'robots-1',
  version: 1,
  robots: [
    { source: 'a-long-planner-name.webp', name: 'planner-checklist' },
    { source: 'kernel-avatar.webp', name: 'kernel' },
  ],
}

function packed() {
  const archive = packBundle(NAMES, [originals()])
  return { archive, pin: { bundle: 'robots-1', version: 1, sha256: sha256(archive) } }
}

const outDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'robots-out-')), 'robots')

test('packs the pictures under their names, with a manifest in order and the licence, the same bytes each time @SC-2020', () => {
  const { archive } = packed()
  assert.deepEqual(packBundle(NAMES, [originals()]), archive)
  const files = unpackTar(archive)
  assert.deepEqual([...files.keys()], ['planner-checklist.webp', 'kernel.webp', 'manifest.json', 'LICENSE'])
  const manifest = JSON.parse(files.get('manifest.json'))
  assert.deepEqual(manifest.robots.map((r) => r.name), ['planner-checklist', 'kernel'])
  assert.equal(manifest.robots[0].sha256, sha256(webp('planner')))
  assert.match(files.get('LICENSE').toString(), /used only as part of Agenthix/)
})

test('refuses to pack a name that is not a robot name, or an original that is not WebP @SC-2020', () => {
  assert.throws(() => packBundle({ ...NAMES, robots: [{ source: 'kernel-avatar.webp', name: 'Kernel!' }] }, [originals()]))
  const dir = originals()
  fs.writeFileSync(path.join(dir, 'kernel-avatar.webp'), 'not a picture')
  assert.throws(() => packBundle(NAMES, [dir]), /not a WebP/)
})

test('installs a pinned archive, replacing what was there @SC-2020', () => {
  const { archive, pin } = packed()
  const out = outDir()
  fs.mkdirSync(out)
  fs.writeFileSync(path.join(out, 'stale.webp'), 'old')
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ bundle: 'robots-0' }))
  install(archive, out, pin)
  assert.deepEqual(fs.readdirSync(out).sort(), ['LICENSE', 'kernel.webp', 'manifest.json', 'planner-checklist.webp'])
})

test('a folder that holds anything but a robots bundle is never replaced @SC-2020', () => {
  const { archive, pin } = packed()
  const out = outDir()
  fs.mkdirSync(out)
  fs.writeFileSync(path.join(out, 'precious.txt'), 'keep me')
  assert.throws(() => install(archive, out, pin), /not a robots bundle/)
  assert.deepEqual(fs.readdirSync(out), ['precious.txt'])
})

test('a SHA-256 that is not the pin fails loudly and installs nothing @SC-2020', () => {
  const { archive, pin } = packed()
  const out = outDir()
  assert.throws(() => install(archive, out, { ...pin, sha256: '0'.repeat(64) }), /not the pinned/)
  assert.equal(fs.existsSync(out), false)
})

test('a bundle whose picture does not match its manifest, or holds an extra file, is refused @SC-2020', () => {
  const files = unpackTar(packed().archive)
  const changed = packTar([...files].map(([name, data]) => ({ name, data: name === 'kernel.webp' ? webp('other') : data })))
  assert.throws(() => install(changed, outDir(), { bundle: 'robots-1', version: 1, sha256: sha256(changed) }), /does not match/)
  const extra = packTar([...[...files].map(([name, data]) => ({ name, data })), { name: 'extra.webp', data: webp('x') }])
  assert.throws(() => install(extra, outDir(), { bundle: 'robots-1', version: 1, sha256: sha256(extra) }), /does not list/)
})

test('another bundle or version than the pin is refused @SC-2020', () => {
  const { archive } = packed()
  assert.throws(() => install(archive, outDir(), { bundle: 'robots-2', version: 2, sha256: sha256(archive) }), /not the pinned/)
})

test('an archive entry with a folder, a parent path or a link is refused @SC-2020', () => {
  const tar = zlib.gunzipSync(packTar([{ name: 'kernel.webp', data: webp('k') }]))
  const withName = (name, type = '0') => {
    const copy = Buffer.from(tar)
    copy.fill(0, 0, 100)
    copy.write(name, 0, 'utf8')
    copy.write(type, 156, 'ascii')
    copy.write('        ', 148, 'ascii')
    let sum = 0
    for (let i = 0; i < 512; i++) sum += copy[i]
    copy.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
    return zlib.gzipSync(copy)
  }
  assert.throws(() => unpackTar(withName('../kernel.webp')), /not flat/)
  assert.throws(() => unpackTar(withName('robots/kernel.webp')), /not flat/)
  assert.throws(() => unpackTar(withName('kernel.webp', '2')), /other than a plain file/)
  assert.ok(unpackTar(withName('kernel.webp')).has('kernel.webp'))
})
