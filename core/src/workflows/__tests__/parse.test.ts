import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition, parseWorkflowDuration } from '../parse.js'
import { checkParameterValues } from '../parameters.js'
import type { WorkflowDefinition } from '../definition.js'
import { DEPLOY_STAGING } from './fixtures.js'

const parsed = (raw: unknown): WorkflowDefinition => {
  const r = parseWorkflowDefinition(raw)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.definition
}
const errorsOf = (raw: unknown) => {
  const r = parseWorkflowDefinition(raw)
  return r.ok ? [] : r.errors
}
const withStep = (step: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ name: 'x', steps: [{ name: 'S', run: 'true', ...step }], ...extra })

describe('parsing a workflow definition', () => {
  it('reads the worked example into one form: defaults, seconds, sorted sets, the files its steps run', () => {
    expect(parsed(DEPLOY_STAGING)).toEqual({
      name: 'deploy-staging',
      description: 'Build, upload and restart the app on staging',
      steps: [
        { name: 'Build', run: 'npm ci && npm run build', secrets: [], timeoutSeconds: null },
        { name: 'Upload', run: './deploy/upload.sh', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: null },
        { name: 'Restart the app', run: './deploy/restart.sh', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: null },
        { name: 'Check it answers', run: 'curl -fsS "https://$STAGING_HOST/health"', secrets: [], timeoutSeconds: null },
      ],
      variables: ['NODE_ENV', 'STAGING_HOST'],
      parameters: [{ name: 'ref', kind: 'pattern', pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$' }],
      hosts: [{ host: 'registry.npmjs.org', port: 443 }, { host: 'staging.example.com', port: 22 }],
      github: {},
      timeoutSeconds: 600,
      files: ['deploy/restart.sh', 'deploy/upload.sh'],
    })
  })

  it('defaults to ten minutes, no hosts, no variables, no parameters', () => {
    const d = parsed({ name: 'x', steps: [{ name: 'S', run: 'true' }] })
    expect(d).toMatchObject({ timeoutSeconds: 600, hosts: [], variables: [], parameters: [], github: {}, files: [], description: '' })
  })

  it('adds the files a definition lists to those its steps run', () => {
    expect(parsed(withStep({}, { files: ['package-lock.json', './.npmrc'] })).files).toEqual(['.npmrc', 'package-lock.json'])
  })

  it('refuses any field it does not know, at the top, in a step or in a parameter', () => {
    expect(errorsOf(withStep({}, { secret: ['A'] })).map(e => e.path)).toEqual(['secret'])
    expect(errorsOf(withStep({ secret: ['A'] })).map(e => e.path)).toEqual(['steps[0].secret'])
    expect(errorsOf(withStep({}, { parameters: [{ name: 'a', text: true, default: 'x' }] })).map(e => e.path)).toEqual(['parameters[0].default'])
  })

  it('refuses what is not a mapping, and a workflow with no steps', () => {
    expect(errorsOf('name: x')).toHaveLength(1)
    expect(errorsOf({ name: 'x' }).map(e => e.path)).toEqual(['steps'])
    expect(errorsOf({ name: 'x', steps: [] }).map(e => e.path)).toEqual(['steps'])
  })

  it('refuses a refused variable name, a bad secret name and a name given twice', () => {
    expect(errorsOf(withStep({}, { variables: ['PATH'] })).map(e => e.path)).toEqual(['variables[0]'])
    expect(errorsOf(withStep({ secrets: ['deploy_key'] })).map(e => e.path)).toEqual(['steps[0].secrets[0]'])
    expect(errorsOf(withStep({ secrets: ['A', 'A'] })).map(e => e.path)).toEqual(['steps[0].secrets[1]'])
    expect(errorsOf(withStep({ secrets: ['A'] }, { variables: ['A'] })).map(e => e.path)).toEqual(['variables'])
  })

  it('refuses a step that runs a file outside the version', () => {
    expect(errorsOf(withStep({ run: './../../etc/x.sh' })).map(e => e.path)).toEqual(['steps[0].run'])
    expect(errorsOf(withStep({}, { files: ['/etc/passwd'] })).map(e => e.path)).toEqual(['files[0]'])
  })

  it('reads time limits and holds a step to the run\'s', () => {
    expect(parseWorkflowDuration('90s')).toBe(90)
    expect(parseWorkflowDuration('1h30m')).toBe(5400)
    for (const t of ['', '0s', '10', 10, '5 m', '1d']) expect(parseWorkflowDuration(t), String(t)).toBeNull()
    expect(parsed(withStep({ timeout: '2m' }, { timeout: '5m' })).steps[0].timeoutSeconds).toBe(120)
    expect(errorsOf(withStep({ timeout: '6m' }, { timeout: '5m' })).map(e => e.path)).toEqual(['steps[0].timeout'])
    expect(errorsOf(withStep({}, { timeout: '7h' })).map(e => e.path)).toEqual(['timeout'])
  })

  it('ties GitHub permissions to GITHUB_TOKEN, both ways', () => {
    const push = parsed(withStep({ secrets: ['GITHUB_TOKEN'] }, { github: { contents: 'write' } }))
    expect(push.github).toEqual({ contents: 'write' })
    expect(errorsOf(withStep({ secrets: ['GITHUB_TOKEN'] })).map(e => e.path)).toEqual(['github'])
    expect(errorsOf(withStep({}, { github: { contents: 'write' } })).map(e => e.path)).toEqual(['github'])
    // GitHub gives a token asked for with no permissions every permission the installation has.
    expect(errorsOf(withStep({ secrets: ['GITHUB_TOKEN'] }, { github: {} })).map(e => e.path)).toEqual(['github'])
  })

  it('refuses a permission GitHub does not have, a level that is not read or write, and writing metadata', () => {
    const at = (github: unknown) => errorsOf(withStep({ secrets: ['GITHUB_TOKEN'] }, { github })).map(e => e.path)
    expect(at({ codez: 'write' })).toEqual(['github.codez'])
    expect(at({ contents: 'admin' })).toEqual(['github.contents'])
    expect(at({ metadata: 'write' })).toEqual(['github.metadata'])
  })

  it('takes exactly one of pattern, values or text for a parameter', () => {
    const at = (p: unknown) => errorsOf(withStep({}, { parameters: [p] })).map(e => e.path)
    expect(at({ name: 'a' })).toEqual(['parameters[0]'])
    expect(at({ name: 'a', text: true, values: ['x'] })).toEqual(['parameters[0]'])
    expect(at({ name: 'a', text: 'yes' })).toEqual(['parameters[0].text'])
    expect(at({ name: 'a', values: [] })).toEqual(['parameters[0].values'])
    expect(at({ name: 'a', pattern: '(a+)+' })).toEqual(['parameters[0].pattern'])
  })

  it('reports, without refusing, a parameter that can start with -', () => {
    const r = parseWorkflowDefinition(withStep({}, { parameters: [{ name: 'branch', pattern: '.+' }, { name: 'mode', values: ['-n', 'x'] }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.notes.map(n => [n.code, n.path])).toEqual([
      ['parameter_may_start_with_dash', 'parameters[0].pattern'],
      ['parameter_may_start_with_dash', 'parameters[1].values'],
    ])
    const safe = parseWorkflowDefinition(DEPLOY_STAGING)
    expect(safe.ok && safe.notes).toEqual([])
  })
})

describe('checking a run\'s parameter values', () => {
  const d = parsed(withStep({}, {
    parameters: [
      { name: 'branch', pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$' },
      { name: 'env', values: ['staging', 'production'] },
      { name: 'message', text: true },
    ],
  }))

  it('accepts values that match', () => {
    const r = checkParameterValues(d, { branch: 'feature/region', env: 'staging', message: 'Fix it\n\n--force is fine here' })
    expect(r.ok).toBe(true)
  })

  it('refuses --force for a branch, a value off the list, a missing value and an unknown parameter', () => {
    const r = checkParameterValues(d, { branch: '--force', env: 'dev', other: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.map(e => e.parameter).sort()).toEqual(['branch', 'env', 'message', 'other'])
  })

  it('refuses a value that is not text, holds NUL, or is too long', () => {
    const r = checkParameterValues(d, { branch: 'a\0', env: 1, message: 'x'.repeat(65_537) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(3)
  })
})
