import { describe, expect, it } from 'vitest'
import { InstallInputProblem, REBUILD_ENV, INSTALL_ENV, installArgv, isPackageDir, readPackageSpec, rebuildArgv } from '../installCommand'

describe('installing with scripts off @SC-1743', () => {
  it('switches scripts off for npm, pnpm and both Yarns by the environment, which outranks the project files', () => {
    expect(INSTALL_ENV).toMatchObject({ npm_config_ignore_scripts: 'true', YARN_IGNORE_SCRIPTS: 'true', YARN_ENABLE_SCRIPTS: 'false' })
  })

  it('passes the flag too, for the managers that take it', () => {
    expect(installArgv('npm', [], false)).toEqual(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'])
    expect(installArgv('npm', ['zod@3', '@types/node'], true)).toEqual(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', 'zod@3', '@types/node'])
    expect(installArgv('pnpm', [], false)).toEqual(['corepack', 'pnpm', 'install', '--ignore-scripts'])
    expect(installArgv('pnpm', ['esbuild'], true)).toEqual(['corepack', 'pnpm', 'add', '--ignore-scripts', '--save-dev', 'esbuild'])
    expect(installArgv('yarn', ['esbuild'], true)).toEqual(['yarn', 'add', '--dev', 'esbuild'])
    expect(installArgv('yarn', [], false)).toEqual(['yarn', 'install'])
  })

  it.each([
    'github:evil/esbuild', 'esbuild@github:evil/esbuild', 'evil@npm:esbuild', 'file:../x', 'x@file:../x',
    'https://evil.example/x.tgz', 'x@https://evil.example/x.tgz', '--ignore-scripts=false', '-g', 'x@--foo', 'Esbuild', '../x', 'x@ 1',
  ])('refuses %s, which is not a registry name and version', spec => {
    expect(() => readPackageSpec(spec)).toThrow(InstallInputProblem)
  })

  it.each(['zod', 'zod@3', 'zod@^3.23.0', '@types/node@>=20 <23', 'react@latest', 'x@1.2.3-beta.1'])('takes %s', spec => {
    expect(readPackageSpec(spec)).toBe(spec)
  })

  it('caps how many packages one install adds', () => {
    expect(() => installArgv('npm', Array.from({ length: 51 }, (_, i) => `p${i}`), false)).toThrow(InstallInputProblem)
  })
})

describe('running one package’s scripts @SC-1743', () => {
  it('always names the package’s folder, so npm never rebuilds everything and the project', () => {
    expect(rebuildArgv('node_modules/esbuild')).toEqual(['npm', 'rebuild', '--no-audit', '--no-fund', './node_modules/esbuild'])
    expect(rebuildArgv('node_modules/.pnpm/@swc+core@1.3.0_x@1.0.0/node_modules/@swc/core')).toContain('./node_modules/.pnpm/@swc+core@1.3.0_x@1.0.0/node_modules/@swc/core')
    expect(REBUILD_ENV.npm_config_ignore_scripts).toBe('false')
  })

  it.each(['', '.', 'esbuild', 'node_modules', '/node_modules/x', 'node_modules/../x', 'node_modules/x/../../y', 'node_modules/x y',
    'node_modules/x;rm', 'node_modules/$(x)', 'node_modules/x\n', 'node_modules//x', 'node_modules/-x'])('refuses the folder %j', dir => {
    expect(isPackageDir(dir)).toBe(false)
    expect(() => rebuildArgv(dir)).toThrow()
  })
})
