import { isIP } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  validateParameterName, validateSecretName, validateStoredSecretName, validateVariableName, validateWorkflowName,
} from '../names.js'
import { normaliseWorkflowPath, fileNamedByRun } from '../paths.js'
import { parseWorkflowHost } from '../hosts.js'
import { permissionsBeyond } from '../githubPermissions.js'

describe('workflow names @SC-1362', () => {
  it('takes lower-case words joined by hyphens', () => {
    for (const n of ['push', 'deploy-staging', 'set-github-secrets', 'a1']) expect(validateWorkflowName(n).ok, n).toBe(true)
    for (const n of ['', 'Deploy', 'deploy_staging', '-push', 'push-', 'a--b', 'x'.repeat(65)]) expect(validateWorkflowName(n).ok, n).toBe(false)
  })
})

describe('secret and variable names @SC-1362', () => {
  it('are capitals, digits and _, not starting with a digit', () => {
    for (const n of ['STAGING_DEPLOY_KEY', 'A', '_X', 'KEY2']) expect(validateSecretName(n).ok, n).toBe(true)
    for (const n of ['', 'staging', '2KEY', 'A-B', 'A B', 'É']) expect(validateSecretName(n).ok, n).toBe(false)
  })

  it('lets a step name GITHUB_TOKEN but no place store it', () => {
    expect(validateSecretName('GITHUB_TOKEN').ok).toBe(true)
    expect(validateStoredSecretName('GITHUB_TOKEN').ok).toBe(false)
    expect(validateStoredSecretName('STAGING_DEPLOY_KEY').ok).toBe(true)
  })

  it('refuses a variable that changes how programs run', () => {
    for (const n of ['PATH', 'HOME', 'BASH_ENV', 'ENV', 'NODE_OPTIONS', 'LD_PRELOAD', 'GIT_DIR', 'SSH_AUTH_SOCK', 'GH_TOKEN',
      'NPM_CONFIG_REGISTRY', 'LD_LIBRARY_PATH', 'HTTPS_PROXY', 'BASH_FUNC_X']) {
      expect(validateVariableName(n).ok, n).toBe(false)
    }
    for (const n of ['STAGING_HOST', 'NODE_ENV', 'REGION', 'PATHWAY']) expect(validateVariableName(n).ok, n).toBe(true)
  })

  it('parameter names are plain lower-case file names', () => {
    for (const n of ['ref', 'branch', 'pr_title']) expect(validateParameterName(n).ok, n).toBe(true)
    for (const n of ['', 'Branch', '1ref', 'a-b', '../x', 'a/b']) expect(validateParameterName(n).ok, n).toBe(false)
  })
})

describe('version file paths @SC-1362', () => {
  it('normalise to one spelling', () => {
    expect(normaliseWorkflowPath('./deploy/upload.sh')).toEqual({ ok: true, path: 'deploy/upload.sh' })
    expect(normaliseWorkflowPath('package-lock.json')).toEqual({ ok: true, path: 'package-lock.json' })
    expect(normaliseWorkflowPath('.npmrc')).toEqual({ ok: true, path: '.npmrc' })
  })

  it('refuse anything that could leave the folder or be read as an option', () => {
    for (const p of ['/etc/passwd', '../x', 'a/../b', 'a//b', 'a/./b', 'a/', '', '.', 'a\\b', 'a\0b', '-rf', 'a/-x', 'a b', '~/x']) {
      expect(normaliseWorkflowPath(p).ok, JSON.stringify(p)).toBe(false)
    }
  })

  it('find the file a step runs', () => {
    expect(fileNamedByRun('./deploy/upload.sh --fast')).toBe('deploy/upload.sh')
    expect(fileNamedByRun('  ./x.sh')).toBe('x.sh')
    expect(fileNamedByRun('npm ci && npm run build')).toBeNull()
    expect(fileNamedByRun('./../escape.sh')).toBe('./../escape.sh')
  })
})

describe('hosts @SC-1362', () => {
  it('take host:port, lower-cased', () => {
    expect(parseWorkflowHost('Registry.npmjs.org:443')).toEqual({ ok: true, host: { host: 'registry.npmjs.org', port: 443 } })
    expect(parseWorkflowHost('10.0.0.5:5432')).toEqual({ ok: true, host: { host: '10.0.0.5', port: 5432 } })
    expect(parseWorkflowHost('[2001:db8::1]:22')).toEqual({ ok: true, host: { host: '[2001:db8::1]', port: 22 } })
    expect(parseWorkflowHost('dns.example.com:53').ok).toBe(false)
  })

  it('refuse a host with no port, a bad port, or a bad name', () => {
    for (const h of ['github.com', 'github.com:0', 'github.com:65536', 'github.com:x', '*.github.com:443', 'a_b.com:443',
      '999.1.1.1:22', '01.1.1.1:22', 'http://github.com:443', '2001:db8::1:22', ':443', 'example.123:80']) {
      expect(parseWorkflowHost(h).ok, h).toBe(false)
    }
  })
})

describe('an IPv6 host is an address, as the proxy reads one @SC-1362', () => {
  it('agrees with net.isIP, address by address', () => {
    const addresses = [
      '::1', '::', '2001:db8::1', '1:2:3:4:5:6:7:8', '1::', '::ffff:1.2.3.4', '::1.2.3.4', '1:2:3:4:5:6:1.2.3.4', 'FE80::1',
      ':::', '1:2', '::1::2', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7::8', '12345::1', 'g::1', ':1::', '1:::2', '::1.2.3', '::1.2.3.256',
      '::01.2.3.4', '1:2:3:4:5:6:7:1.2.3.4', '::.', '1.2.3.4',
    ]
    for (const a of addresses) {
      const wanted = isIP(a.toLowerCase()) === 6
      expect(parseWorkflowHost(`[${a}]:443`).ok, a).toBe(wanted)
    }
  })
})

describe('GitHub permissions @SC-1362', () => {
  it('names what a grant does not cover, write covering read', () => {
    expect(permissionsBeyond({ contents: 'write', issues: 'read' }, { contents: 'read', issues: 'write' })).toEqual({ contents: 'write' })
    expect(permissionsBeyond({ contents: 'read' }, { contents: 'write' })).toEqual({})
  })
})
