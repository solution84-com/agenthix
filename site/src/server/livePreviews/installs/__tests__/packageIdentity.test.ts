import { describe, expect, it } from 'vitest'
import { isRegistrySpec, isRegistryTarball, packageIdentity, registryCopyIdentity } from '../packageIdentity'
import type { ScannedPackage } from '../scanScript'

const pkg = (over: Partial<ScannedPackage>): ScannedPackage => ({
  dir: 'node_modules/esbuild', folder: 'esbuild', name: 'esbuild', version: '0.21.5', scripts: ['postinstall'], gyp: false,
  origin: { kind: 'npm', resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz', version: '0.21.5' }, specs: ['^0.21.0'], ...over,
})

describe('which published package an installed copy is @SC-1744', () => {
  it('takes a copy from the public registry as its name and version', () => {
    expect(packageIdentity(pkg({}))).toEqual({ identity: { name: 'esbuild', version: '0.21.5' } })
    expect(packageIdentity(pkg({ folder: '@swc/core', name: '@swc/core', version: '1.3.0', origin: { kind: 'pnpm', id: '@swc+core@1.3.0_@swc+helpers@0.5.0' } })))
      .toEqual({ identity: { name: '@swc/core', version: '1.3.0' } })
    expect(packageIdentity(pkg({ origin: { kind: 'yarn', resolved: ['https://registry.yarnpkg.com/esbuild/-/esbuild-0.21.5.tgz#abc'] } })))
      .toEqual({ identity: { name: 'esbuild', version: '0.21.5' } })
  })

  it('does not take a dependency from git that calls itself a well-known package', () => {
    expect(packageIdentity(pkg({ origin: { kind: 'npm', resolved: 'git+ssh://git@github.com/evil/esbuild.git#abc', version: '0.21.5' } }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ origin: { kind: 'pnpm', id: 'esbuild@https+++codeload.github.com+evil+esbuild' } }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ origin: { kind: 'yarn', resolved: ['https://codeload.github.com/evil/esbuild/tar.gz/abc'] } }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ origin: { kind: 'none' } }))).toHaveProperty('unchecked')
  })

  it('does not take an alias, where another package sits in a well-known name’s folder', () => {
    expect(packageIdentity(pkg({ name: 'evil' }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ origin: { kind: 'npm', resolved: 'https://registry.npmjs.org/evil/-/evil-0.21.5.tgz', version: '0.21.5' } }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ origin: { kind: 'yarn', resolved: [] } }))).toHaveProperty('unchecked')
  })

  it('needs a registry version', () => {
    expect(packageIdentity(pkg({ version: 'latest' }))).toHaveProperty('unchecked')
    expect(packageIdentity(pkg({ version: null }))).toHaveProperty('unchecked')
  })

  it('matches the registry tarball exactly', () => {
    expect(isRegistryTarball('https://registry.npmjs.org/@swc/core/-/core-1.3.0.tgz', '@swc/core', '1.3.0')).toBe(true)
    expect(isRegistryTarball('https://registry.npmjs.org.evil.example/esbuild/-/esbuild-0.21.5.tgz', 'esbuild', '0.21.5')).toBe(false)
    expect(isRegistryTarball('http://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz', 'esbuild', '0.21.5')).toBe(false)
    expect(isRegistryTarball('https://registry.npmjs.org/esbuild/-/esbuild-0.21.6.tgz', 'esbuild', '0.21.5')).toBe(false)
  })

  it('takes a Yarn 1 copy only where Yarn hoists it, so a folder another tarball carries cannot borrow its lock entry', () => {
    const yarn = { kind: 'yarn' as const, resolved: ['https://registry.yarnpkg.com/esbuild/-/esbuild-0.21.5.tgz#abc'] }
    expect(packageIdentity(pkg({ origin: yarn }))).toHaveProperty('identity')
    expect(packageIdentity(pkg({ dir: 'node_modules/evil/node_modules/esbuild', origin: yarn }))).toHaveProperty('unchecked')
  })
})

describe('a trusted scope’s copy @SC-1744', () => {
  const scoped = (over: Partial<ScannedPackage>) => pkg({
    dir: 'node_modules/@fernhill/ui', folder: '@fernhill/ui', name: '@fernhill/ui', version: '1.0.0',
    origin: { kind: 'npm', resolved: 'https://npm.pkg.github.com/download/@fernhill/ui/1.0.0/abc', version: '1.0.0' }, specs: ['^1.0.0'], ...over,
  })

  it('is taken from any registry when the project asked for it only as a version', () => {
    expect(registryCopyIdentity(scoped({}))).toEqual({ identity: { name: '@fernhill/ui', version: '1.0.0' } })
    expect(registryCopyIdentity(scoped({ origin: { kind: 'pnpm', id: '@fernhill+ui@1.0.0' } }))).toHaveProperty('identity')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'yarn', resolved: ['https://npm.fernhill.example/@fernhill/ui/-/ui-1.0.0.tgz#abc'] } }))).toHaveProperty('identity')
  })

  it('is not taken when anything in the project asks for it from a URL, git, GitHub, a file, a link or an alias', () => {
    for (const spec of ['https://evil.example/t.tgz', 'git+https://x/y.git', 'github:evil/t', 'evil/t', 'file:../t', 'link:../t', 'npm:evil@1', '..', './t']) {
      expect(registryCopyIdentity(scoped({ specs: ['^1.0.0', spec] }))).toHaveProperty('unchecked')
    }
    expect(registryCopyIdentity(scoped({ specs: [] }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ specs: null }))).toHaveProperty('unchecked')
  })

  it('is not taken from git, a file, plain http, a pnpm store folder for a URL, or a Yarn copy not hoisted', () => {
    expect(registryCopyIdentity(scoped({ origin: { kind: 'npm', resolved: 'git+ssh://git@github.com/evil/t.git', version: '1.0.0' } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'npm', resolved: 'file:../t', version: '1.0.0' } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'npm', resolved: 'http://npm.fernhill.example/t.tgz', version: '1.0.0' } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'npm', resolved: null, version: '1.0.0' } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'pnpm', id: '@fernhill+ui@https+++evil.example+t.tgz' } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ dir: 'node_modules/a/node_modules/@fernhill/ui', origin: { kind: 'yarn', resolved: ['https://r.example/t.tgz'] } }))).toHaveProperty('unchecked')
    expect(registryCopyIdentity(scoped({ origin: { kind: 'none' } }))).toHaveProperty('unchecked')
  })

  it('reads ranges and tags as versions', () => {
    for (const spec of ['^1.0.0', '~1.2', '1.x', '>=1 <2', 'latest', '*', '', '1.0.0 || 2.0.0']) expect(isRegistrySpec(spec)).toBe(true)
  })
})
