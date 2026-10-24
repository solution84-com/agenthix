import { describe, it, expect } from 'vitest'
import { WORKFLOW_CONTAINER_LIMITS } from '@agenthix/core'
import { buildStepRunCommand, valuesArchive, type StepContainerSpec } from '../stepContainer'
import { commandForStep } from '../approvedFiles'
import { CANARY } from './fixtures'

const spec = (over: Partial<StepContainerSpec> = {}): StepContainerSpec => ({
  runId: 'run-1', index: 1, image: `sha256:${'c'.repeat(64)}`,
  workflowDir: '/site/executor/runs/run-1/workflow', outDir: '/site/executor/runs/run-1/out',
  snapshotDir: '/site/executor/runs/run-1/snapshot', workdir: '/projects/p/workspaces/w',
  readOnlyWorkspace: true, limits: WORKFLOW_CONTAINER_LIMITS, networkArgs: ['--network', 'none'],
  variables: { STAGING_HOST: 'staging.example.com' }, github: null, command: '/run/workflow/deploy/upload.sh',
  ...over,
})

const pair = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))

describe('how an executor container is started', () => {
  const { args, clientEnv } = buildStepRunCommand(spec())

  it('has every setting the spec lists', () => {
    expect(args.slice(0, 2)).toEqual(['run', '-i'])
    expect(pair(args, '--user')).toEqual(['1001:1001'])
    expect(pair(args, '--cap-drop')).toEqual(['ALL'])
    expect(pair(args, '--security-opt')).toEqual(['no-new-privileges'])
    expect(args).toContain('--read-only')
    expect(pair(args, '--memory')).toEqual(['1024m'])
    expect(pair(args, '--memory-swap')).toEqual(['1024m'])
    expect(pair(args, '--pids-limit')).toEqual(['256'])
    expect(pair(args, '--cpus')).toEqual(['1'])
    expect(pair(args, '--network')).toEqual(['none'])
    expect(pair(args, '--log-driver')).toEqual(['none'])
    const tmpfs = pair(args, '--tmpfs')
    expect(tmpfs.some(t => t!.startsWith('/tmp:'))).toBe(true)
    expect(tmpfs.some(t => t!.startsWith('/run/secrets:') && t!.includes('noexec'))).toBe(true)
    expect(tmpfs.some(t => t!.startsWith('/run/params:'))).toBe(true)
    expect(pair(args, '-e')).toEqual(expect.arrayContaining(['HOME=/tmp/home', 'XDG_CONFIG_HOME=/tmp/home/.config', 'GH_CONFIG_DIR=/tmp/home/.config/gh']))
    expect(pair(args, '-w')).toEqual(['/projects/p/workspaces/w'])
  })

  it('binds the approved files read-only and the scratch folder writable', () => {
    const volumes = pair(args, '-v')
    expect(volumes).toContain('/site/executor/runs/run-1/workflow:/run/workflow:ro')
    expect(volumes).toContain('/site/executor/runs/run-1/out:/run/out:rw')
  })

  it('binds the snapshot at the agent\'s path, read-only for a step with a secret and writable without one', () => {
    expect(pair(args, '-v')).toContain('/site/executor/runs/run-1/snapshot:/projects/p/workspaces/w:ro')
    const plain = buildStepRunCommand(spec({ readOnlyWorkspace: false })).args
    expect(pair(plain, '-v')).toContain('/site/executor/runs/run-1/snapshot:/projects/p/workspaces/w:rw')
  })

  it('never mounts the Docker socket or anything of the site\'s beyond the run\'s folders', () => {
    expect(args.join(' ')).not.toMatch(/docker\.sock/)
    expect(pair(args, '-v')).toHaveLength(3)
    expect(args).not.toContain('--privileged')
  })

  it('gives variables by name, their values only to the docker client', () => {
    expect(pair(args, '-e')).toContain('STAGING_HOST')
    expect(args).not.toContain('STAGING_HOST=staging.example.com')
    expect(clientEnv).toEqual({ STAGING_HOST: 'staging.example.com' })
  })

  it('runs the image by id and the step as an argument, never pasted into the shell text', () => {
    const i = args.indexOf(`sha256:${'c'.repeat(64)}`)
    expect(args.slice(i + 1, i + 3)).toEqual(['bash', '-c'])
    expect(args[args.length - 1]).toBe('/run/workflow/deploy/upload.sh')
  })
})

describe('the values archive', () => {
  it('holds each secret and parameter as a read-only file, and no value is on the command line', () => {
    const tar = valuesArchive({ STAGING_DEPLOY_KEY: Buffer.from(CANARY) }, { ref: 'main' })
    expect(tar.length % 512).toBe(0)
    expect(tar.subarray(0, 100).toString().replace(/\0+$/, '')).toBe('STAGING_DEPLOY_KEY')
    expect(tar.subarray(345, 352).toString()).toBe('secrets')
    expect(tar.subarray(100, 107).toString()).toBe('0000400')
    expect(tar.includes(Buffer.from(CANARY))).toBe(true)
    const { args, clientEnv } = buildStepRunCommand(spec())
    expect(JSON.stringify({ args, clientEnv })).not.toContain(CANARY)
  })

  it('refuses a name that could leave its folder', () => {
    expect(() => valuesArchive({ '../x': Buffer.from('a') }, {})).toThrow()
  })
})

describe('a step\'s command', () => {
  it('runs the version\'s own file from /run/workflow', () => {
    const files = new Set(['deploy/upload.sh'])
    expect(commandForStep('./deploy/upload.sh --fast', files, 'deploy/upload.sh')).toBe('/run/workflow/deploy/upload.sh --fast')
    expect(commandForStep('npm run build', files, null)).toBe('npm run build')
  })

  it('gives every step the run\'s repository, and lets a step run programs from /tmp', () => {
    const { args } = buildStepRunCommand(spec({ github: { repository: 'acme/site', cloneUrl: 'https://github.com/acme/site.git' } }))
    expect(args).toContain('GITHUB_REPOSITORY=acme/site')
    expect(args).toContain('GITHUB_REPOSITORY_URL=https://github.com/acme/site.git')
    expect(args.find(a => a.startsWith('/tmp:'))).toMatch(/(^|,)exec(,|$)/)
  })
})
