/**
 * The walk that finds packages with install scripts, run with this machine's node on folders laid out the way npm,
 * pnpm and Yarn 1 leave them. In a live preview it runs in the container, through the launcher.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SCAN_SCRIPT, readScan } from '../scanScript'

let root = ''
const write = (rel: string, body: string | object) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body))
}
const pkgJson = (name: string, version: string, scripts: Record<string, string> = {}) => ({ name, version, scripts })
const scan = () => {
  const r = spawnSync(process.execPath, ['-e', SCAN_SCRIPT, root], { encoding: 'utf8' })
  expect(r.status).toBe(0)
  return readScan(r.stdout)!
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')))
})

describe('finding the packages with install scripts @SC-1744', () => {
  it('npm: hoisted and nested copies, scoped names, a native build with no script, and npm’s record of where each came from', () => {
    write('node_modules/esbuild/package.json', pkgJson('esbuild', '0.21.5', { postinstall: 'node install.js' }))
    write('node_modules/zod/package.json', pkgJson('zod', '3.23.0', { test: 'vitest' }))
    write('node_modules/@swc/core/package.json', pkgJson('@swc/core', '1.3.0', { postinstall: 'node postinstall.js' }))
    write('node_modules/zod/node_modules/bcrypt/package.json', pkgJson('bcrypt', '5.1.0', { install: 'node-pre-gyp install' }))
    write('node_modules/native/package.json', pkgJson('native', '1.0.0'))
    write('node_modules/native/binding.gyp', '{}')
    write('node_modules/.package-lock.json', { packages: { 'node_modules/esbuild': { version: '0.21.5', resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz' } } })
    const found = scan()
    expect(found.packages.map(p => p.dir)).toEqual([
      'node_modules/@swc/core', 'node_modules/esbuild', 'node_modules/native', 'node_modules/zod/node_modules/bcrypt',
    ])
    expect(found.packages.find(p => p.folder === 'esbuild')).toMatchObject({
      scripts: ['postinstall'], gyp: false,
      origin: { kind: 'npm', resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz', version: '0.21.5' },
    })
    expect(found.packages.find(p => p.folder === 'native')).toMatchObject({ scripts: [], gyp: true })
    expect(found.packages.find(p => p.folder === 'bcrypt')).toMatchObject({ origin: { kind: 'npm', resolved: null } })
  })

  it('pnpm: the real folders in its store, never its links', () => {
    write('node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/package.json', pkgJson('esbuild', '0.21.5', { postinstall: 'node install.js' }))
    fs.symlinkSync('.pnpm/esbuild@0.21.5/node_modules/esbuild', path.join(root, 'node_modules', 'esbuild'))
    const found = scan()
    expect(found.packages).toHaveLength(1)
    expect(found.packages[0]).toMatchObject({ dir: 'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild', origin: { kind: 'pnpm', id: 'esbuild@0.21.5' } })
  })

  it('never follows a link out of the project', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    fs.mkdirSync(path.join(outside, 'evil'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'evil', 'package.json'), JSON.stringify(pkgJson('evil', '1.0.0', { install: 'x' })))
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.symlinkSync(path.join(outside, 'evil'), path.join(root, 'node_modules', 'evil'))
    fs.symlinkSync(outside, path.join(root, 'node_modules', '@scope'))
    write('node_modules/x/package.json', pkgJson('x', '1.0.0', { install: 'x' }))
    fs.symlinkSync(path.join(outside, 'evil', 'package.json'), path.join(root, 'node_modules', 'x', 'package.json.link'))
    expect(scan().packages.map(p => p.folder)).toEqual(['x'])
  })

  it('reads a package.json that is a link as none', () => {
    fs.mkdirSync(path.join(root, 'node_modules', 'y'), { recursive: true })
    write('elsewhere.json', pkgJson('y', '1.0.0', { install: 'x' }))
    fs.symlinkSync(path.join(root, 'elsewhere.json'), path.join(root, 'node_modules', 'y', 'package.json'))
    expect(scan().packages).toEqual([])
  })

  it('Yarn 1: where each name and version came from, from yarn.lock', () => {
    write('node_modules/esbuild/package.json', pkgJson('esbuild', '0.21.5', { postinstall: 'node install.js' }))
    write('yarn.lock', [
      '# yarn lockfile v1', '',
      'esbuild@^0.21.0, esbuild@~0.21.5:', '  version "0.21.5"', '  resolved "https://registry.yarnpkg.com/esbuild/-/esbuild-0.21.5.tgz#abc"', '',
      '"esbuild@github:evil/esbuild":', '  version "0.21.4"', '  resolved "https://codeload.github.com/evil/esbuild/tar.gz/abc"', '',
    ].join('\n'))
    expect(scan().packages[0].origin).toEqual({ kind: 'yarn', resolved: ['https://registry.yarnpkg.com/esbuild/-/esbuild-0.21.5.tgz#abc'] })
  })

  it('reports every way the project asks for a name: dependents in npm’s lockfile, its own package.json, overrides', () => {
    const name = '@fernhill/telemetry'
    write(`node_modules/${name}/package.json`, pkgJson(name, '1.0.0', { postinstall: 'node x.js' }))
    write('package.json', { dependencies: { [name]: '^1.0.0' }, overrides: { 'other': { [name]: 'file:../t' } } })
    write('node_modules/.package-lock.json', { packages: {
      'node_modules/handy-lib': { version: '1.0.0', dependencies: { [name]: 'https://evil.example/t.tgz' } },
      [`node_modules/${name}`]: { version: '1.0.0', resolved: 'https://evil.example/t.tgz' },
    } })
    expect(scan().packages[0].specs?.sort()).toEqual(['^1.0.0', 'file:../t', 'https://evil.example/t.tgz'])
  })

  it('reports each Yarn 1 lock entry’s spec for the name', () => {
    write('node_modules/esbuild/package.json', pkgJson('esbuild', '0.21.5', { postinstall: 'node install.js' }))
    write('yarn.lock', [
      'esbuild@^0.21.0:', '  version "0.21.5"', '',
      '"esbuild@github:evil/esbuild":', '  version "0.21.4"', '',
    ].join('\n'))
    expect(scan().packages[0].specs).toEqual(['^0.21.0', 'github:evil/esbuild'])
  })

  it('says when the project is Yarn Plug’n’Play', () => {
    write('.pnp.cjs', '')
    expect(scan()).toEqual({ pnp: true, truncated: false, packages: [] })
  })
})

describe('reading what the live preview printed @SC-1744', () => {
  it('drops an entry that is not one, and anything not JSON', () => {
    expect(readScan('not json')).toBeNull()
    expect(readScan('{"packages": 1}')).toBeNull()
    const read = readScan(JSON.stringify({ pnp: false, truncated: false, packages: [
      { dir: '../etc', folder: 'x', scripts: ['install'], origin: { kind: 'none' } },
      { dir: 'node_modules/x', folder: 'X Y', scripts: ['install'], origin: { kind: 'none' } },
      { dir: 'node_modules/x', folder: 'x', name: 'x', version: '1.0.0', scripts: ['install', 'rm -rf /'], gyp: 'yes', origin: { kind: 'odd' } },
    ] }))
    expect(read?.packages).toEqual([{ dir: 'node_modules/x', folder: 'x', name: 'x', version: '1.0.0', scripts: ['install'], gyp: false, origin: { kind: 'none' }, specs: null }])
  })
})
