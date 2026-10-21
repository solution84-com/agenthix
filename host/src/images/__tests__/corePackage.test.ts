import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const core = path.resolve(__dirname, '../../../../core')
const pkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'))
const workflows = path.resolve(core, '../.github/workflows')

describe('core as a package @SC-1054', () => {
  it('can be published, and ships its built output only', () => {
    expect(pkg.private).toBeUndefined()
    expect(pkg.name).toBe('@agenthix/core')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.publishConfig).toEqual({ registry: 'https://npm.pkg.github.com' })
    expect(Object.keys(pkg.exports)).toEqual(['.', './client', './host-crypto', './cloud-crypto'])
    const build = JSON.parse(fs.readFileSync(path.join(core, 'tsconfig.build.json'), 'utf8'))
    expect(build.compilerOptions.declarationMap).toBe(false)
  })

  it('is published by the release run alone, and only after the commit passed its checks and every image is published @SC-1167', () => {
    const others = fs.readdirSync(workflows).filter(f => f !== 'publish-images.yml')
    for (const f of others) expect(fs.readFileSync(path.join(workflows, f), 'utf8'), f).not.toMatch(/npm publish/)
    const workflow = fs.readFileSync(path.join(workflows, 'publish-images.yml'), 'utf8')
    expect(workflow).not.toMatch(/workflow_dispatch|pull_request|branches:/)
    expect(workflow).toMatch(/permissions: \{\}/)
    expect(workflow).toMatch(/check-runs\?check_name=All%20checks%20passed/)
    expect(workflow).toMatch(/\n {2}build:\n(?: {4}.*\n)*? {4}needs: release\n/)
    expect(workflow).toMatch(/\n {2}core:\n(?: {4}.*\n)*? {4}needs: \[release, publish\]\n(?: {4}.*\n)*? {4}permissions:\n {6}contents: read\n {6}packages: write\n/)
  })
})
