import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLAUDE_COMMAND_SHELL_PREFIX,
  COMMAND_HOME,
  COMMAND_LAUNCHER_PATH,
  COMMAND_READABLE_ENV,
  CONTAINED_GIT_PATH,
  CONTAINED_RIPGREP_PATH,
  HARNESS_GIT_CONFIG,
  HARNESS_SECRET_ENV,
  LANDLOCK_ABI_COMMAND,
  LANDLOCK_REQUIRED_ABI,
  OPENCODE_COMMAND_SHELL,
  OPENCODE_MODELS_FILE,
  OPENCODE_PLUGIN_URL,
  OPENCODE_VERSION,
  SYSTEM_GIT_PATH,
  SYSTEM_RIPGREP_PATH,
  landlockAbiSufficient,
  parseLandlockAbi,
} from '../agentImage'

const SITE = fileURLToPath(new URL('../../../../', import.meta.url))
const read = (rel: string) => fs.readFileSync(path.join(SITE, rel), 'utf8')
const dockerfile = read('docker/agent.Dockerfile')
const launcher = read('docker/launcher/agenthix-contain.c')

function dockerArg(name: string): string | undefined {
  return dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, 'm'))?.[1]
}

describe('the agent image and the site agree', () => {
  it('removes exactly the secrets the site lists, and lists each once', () => {
    const list = read('docker/launcher/secret-env.list')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    expect(new Set(HARNESS_SECRET_ENV).size).toBe(HARNESS_SECRET_ENV.length)
    expect([...list].sort()).toEqual([...HARNESS_SECRET_ENV].sort())
    expect(HARNESS_SECRET_ENV).toEqual(expect.arrayContaining(['OPENCODE_SERVER_PASSWORD', 'SITE_HARNESS_KEY', 'ANTHROPIC_API_KEY']))
  })

  it('pins the Claude Code CLI the site SDK bundles', () => {
    const manifest = JSON.parse(read('node_modules/@anthropic-ai/claude-agent-sdk/manifest.json')) as { version: string }
    expect(dockerArg('CLAUDE_CODE_VERSION')).toBe(manifest.version)
  })

  it('pins one OpenCode version for the image and the plugin it builds against', () => {
    const plugin = JSON.parse(read('opencode-plugin/package.json')) as { devDependencies: Record<string, string> }
    expect(dockerArg('OPENCODE_VERSION')).toBe(OPENCODE_VERSION)
    expect(plugin.devDependencies['@opencode-ai/plugin']).toBe(OPENCODE_VERSION)
  })

  it('installs the launcher, both wrappers, the plugin and the catalogue where the site names them', () => {
    const pluginPath = OPENCODE_PLUGIN_URL.replace(/^file:\/\//, '')
    for (const target of [COMMAND_LAUNCHER_PATH, CLAUDE_COMMAND_SHELL_PREFIX, OPENCODE_COMMAND_SHELL, pluginPath, OPENCODE_MODELS_FILE]) {
      expect(dockerfile).toMatch(new RegExp(`\\s${target.replace(/[.]/g, '\\.')}(\\s|$)`, 'm'))
    }
    expect(read('docker/launcher/bash')).toContain(`exec ${COMMAND_LAUNCHER_PATH} /bin/bash "$@"`)
    expect(read('docker/launcher/claude-shell-prefix')).toContain(`exec ${COMMAND_LAUNCHER_PATH} /bin/bash -c "$@"`)
    expect(path.basename(OPENCODE_COMMAND_SHELL)).toBe('bash')
  })

  it('puts an rg that runs the real one through the launcher ahead of it on the PATH', () => {
    expect(dockerfile).toMatch(new RegExp(`^COPY --chmod=0755 site/docker/launcher/rg ${CONTAINED_RIPGREP_PATH}$`, 'm'))
    expect(dockerfile).toContain(`test "$(command -v rg)" = ${CONTAINED_RIPGREP_PATH} && test -x ${SYSTEM_RIPGREP_PATH}`)
    const wrapper = read('docker/launcher/rg')
    expect(wrapper.startsWith('#!/bin/sh\n')).toBe(true)
    expect(wrapper.trim().split('\n').at(-1)).toBe(`exec ${COMMAND_LAUNCHER_PATH} ${SYSTEM_RIPGREP_PATH} "$@"`)
  })

  it('puts a git that runs the real one through the launcher ahead of it on the PATH, with no hook or fsmonitor for a harness', () => {
    expect(dockerfile).toMatch(new RegExp(`^COPY --chmod=0755 site/docker/launcher/git ${CONTAINED_GIT_PATH}$`, 'm'))
    expect(dockerfile).toContain(`test "$(command -v git)" = ${CONTAINED_GIT_PATH} && test -x ${SYSTEM_GIT_PATH}`)
    expect(HARNESS_GIT_CONFIG).toEqual(['core.hooksPath=/dev/null', 'core.fsmonitor=false'])
    const wrapper = read('docker/launcher/git')
    expect(wrapper.startsWith('#!/bin/sh\n')).toBe(true)
    const execs = wrapper.split('\n').map(line => line.trim()).filter(line => line.startsWith('exec '))
    const harnessOptions = HARNESS_GIT_CONFIG.map(c => `-c ${c}`).join(' ')
    expect(execs).toEqual([
      `exec ${COMMAND_LAUNCHER_PATH} ${SYSTEM_GIT_PATH} ${harnessOptions} "$@"`,
      `exec ${COMMAND_LAUNCHER_PATH} ${SYSTEM_GIT_PATH} "$@"`,
    ])
    // A harness is told apart from an agent's command by what only the sandbox refuses: listing /.
    expect(wrapper).toContain('if /bin/ls / >/dev/null 2>&1; then')
  })

  it("matches the launcher's own required ABI, command home and readable-folder variable", () => {
    expect(launcher).toMatch(new RegExp(`#define REQUIRED_ABI ${LANDLOCK_REQUIRED_ABI}\\n`))
    expect(launcher).toContain(`#define COMMAND_HOME "${COMMAND_HOME}"`)
    expect(launcher).toContain(`#define READABLE_ENV "${COMMAND_READABLE_ENV}"`)
    expect(dockerfile).toContain(COMMAND_HOME)
  })
})

describe('asking the Landlock ABI', () => {
  it('is the launcher with --abi', () => {
    expect(LANDLOCK_ABI_COMMAND).toEqual([COMMAND_LAUNCHER_PATH, '--abi'])
  })

  it('reads the number the launcher prints, and nothing else', () => {
    expect(parseLandlockAbi('8\n')).toBe(8)
    expect(parseLandlockAbi('0')).toBe(0)
    expect(parseLandlockAbi('')).toBeNull()
    expect(parseLandlockAbi('agenthix-contain: usage')).toBeNull()
    expect(parseLandlockAbi('-1')).toBeNull()
  })

  it('needs ABI 6 or later', () => {
    expect(landlockAbiSufficient(6)).toBe(true)
    expect(landlockAbiSufficient(8)).toBe(true)
    expect(landlockAbiSufficient(5)).toBe(false)
    expect(landlockAbiSufficient(0)).toBe(false)
    expect(landlockAbiSufficient(null)).toBe(false)
  })
})
