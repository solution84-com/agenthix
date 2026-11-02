import { describe, it, expect } from 'vitest'
import {
  FORBIDDEN_SERVER_ENV, OPENCODE_KEY_PLACEHOLDER, credentialProblem, parseOpenCodeModel,
  renderOpenCodeConfig, renderServerEnv,
} from '../openCodeConfig'
import { parseOpenCodePluginConfig } from '@agenthix/core'
import { HARNESS_SECRET_ENV, OPENCODE_COMMAND_SHELL, OPENCODE_MODELS_FILE, OPENCODE_PLUGIN_URL } from '../../agentImage'

const settings = { password: 'pw-secret', serverKey: 'key-secret', siteUrl: 'http://host.docker.internal:4201', compatible: null }

describe("the OpenCode server's environment", () => {
  const env = renderServerEnv(settings)

  it('turns off every outbound connection of OpenCode\'s own and everything it would read from the home', () => {
    expect(env).toMatchObject({
      OPENCODE_DISABLE_MODELS_FETCH: '1',
      OPENCODE_DISABLE_SHARE: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
      OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
      OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
      OPENCODE_DISABLE_PROJECT_CONFIG: '1',
      npm_config_offline: 'true',
      OPENCODE_MODELS_PATH: OPENCODE_MODELS_FILE,
      OPENCODE_AUTH_CONTENT: '{}',
    })
  })

  it('never sets a variable that widens what OpenCode reaches, nor a conversation\'s tag', () => {
    for (const name of FORBIDDEN_SERVER_ENV) expect(env).not.toHaveProperty(name)
  })

  it('holds no provider key', () => {
    for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'EXA_API_KEY']) {
      expect(env).not.toHaveProperty(name)
    }
  })

  it('carries the password and the plugin\'s key, both of which the launcher and the plugin keep from commands', () => {
    expect(env.OPENCODE_SERVER_PASSWORD).toBe('pw-secret')
    expect(env.SITE_HARNESS_KEY).toBe('key-secret')
    expect(HARNESS_SECRET_ENV).toEqual(expect.arrayContaining(['OPENCODE_SERVER_PASSWORD', 'SITE_HARNESS_KEY', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_AUTH_CONTENT']))
  })

  it('configures the plugin with the site\'s address and every secret to blank in commands', () => {
    const plugin = parseOpenCodePluginConfig(env.SITE_PLUGIN_CONFIG)
    expect(plugin).not.toBeNull()
    expect(plugin!.siteUrl).toBe('http://host.docker.internal:4201')
    expect(plugin!.secretEnv).toEqual([...HARNESS_SECRET_ENV, 'SITE_PLUGIN_CONFIG'])
    expect(plugin!.commandEnv).toMatchObject({ npm_config_offline: 'false' })
    // adr-0170: every command installs with scripts off, whichever package manager.
    expect(plugin!.commandEnv).toMatchObject({ npm_config_ignore_scripts: 'true', YARN_IGNORE_SCRIPTS: 'true', YARN_ENABLE_SCRIPTS: 'false' })
    expect(plugin!.commandEnv).not.toHaveProperty('HOME')
  })
})

describe("the OpenCode server's configuration", () => {
  const SITE = 'http://host.docker.internal:4201'
  const config = renderOpenCodeConfig(SITE, null) as Record<string, any>

  it('allows everything but what the model must not see, and denies skill so only the turn\'s own list is shown', () => {
    expect(config.permission).toEqual({ '*': 'allow', task: 'deny', question: 'deny', skill: 'deny' })
    expect(Object.keys(config.permission)[0]).toBe('*')
  })

  it('loads the plugin, runs commands through the launcher, and shares and updates nothing', () => {
    expect(config.plugin).toEqual([OPENCODE_PLUGIN_URL])
    expect(config.shell).toBe(OPENCODE_COMMAND_SHELL)
    expect(config.share).toBe('disabled')
    expect(config.autoupdate).toBe(false)
    for (const key of ['lsp', 'formatter', 'instructions', 'skills', 'mcp', 'experimental', 'small_model']) expect(config).not.toHaveProperty(key)
  })

  it("records no snapshots, whose git folder is in the server's home, out of a contained git's reach", () => {
    expect(config.snapshot).toBe(false)
  })

  it('names only Agenthix\'s providers, each addressed at the site\'s model relay, with no real key', () => {
    expect(config.enabled_providers).toEqual(['openrouter', 'openai', 'google', 'anthropic'])
    expect(config.provider.openrouter.options).toEqual({ baseURL: `${SITE}/api/v1/model-relay/openrouter`, apiKey: OPENCODE_KEY_PLACEHOLDER })
    expect(config.provider.openai.options.baseURL).toBe(`${SITE}/api/v1/model-relay/openai`)
    expect(config.provider.google.options.baseURL).toBe(`${SITE}/api/v1/model-relay/google`)
    // OpenCode's Anthropic SDK appends /messages to a base ending /v1.
    expect(config.provider.anthropic.options.baseURL).toBe(`${SITE}/api/v1/model-relay/anthropic/v1`)
    expect(JSON.stringify(config)).not.toMatch(/openrouter\.ai|api\.openai\.com|googleapis|api\.anthropic\.com/)
  })

  it('adds an OpenAI-compatible endpoint with its models when one is needed, addressed at the relay and never at its own address', () => {
    const c = renderOpenCodeConfig(SITE, { models: ['llama3'] }) as Record<string, any>
    expect(c.enabled_providers).toContain('openai_compatible')
    expect(c.provider.openai_compatible).toEqual({
      npm: '@ai-sdk/openai-compatible',
      name: 'OpenAI-compatible endpoint',
      options: { baseURL: `${SITE}/api/v1/model-relay/openai_compatible`, apiKey: OPENCODE_KEY_PLACEHOLDER },
      models: { llama3: { name: 'llama3', tool_call: true } },
    })
  })
})

describe('a turn\'s model and credential', () => {
  it('reads a model named with its provider, the model id kept whole', () => {
    expect(parseOpenCodeModel('openrouter/qwen/qwen3.8-27b:free')).toEqual({ providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free', provider: 'openrouter' })
    expect(parseOpenCodeModel('openai_compatible/llama3')).toEqual({ providerID: 'openai_compatible', modelID: 'llama3', provider: 'openai_compatible' })
    expect(parseOpenCodeModel('claude-sonnet-4-5')).toBeNull()
    expect(parseOpenCodeModel('opencode/big-pickle')).toBeNull()
    expect(parseOpenCodeModel('openai/')).toBeNull()
  })

  it('refuses a missing credential, a subscription, another provider\'s key, or a compatible endpoint with no address @SC-782', () => {
    const m = parseOpenCodeModel('openrouter/x')!
    expect(credentialProblem(m, null)).toMatch(/No model credential is configured for openrouter/)
    expect(credentialProblem(m, { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' })).toMatch(/Claude runtime/)
    expect(credentialProblem(m, { kind: 'apiKey', provider: 'openai', apiKey: 'k' })).toMatch(/openai credential for a openrouter model/)
    expect(credentialProblem(m, { kind: 'apiKey', provider: 'openrouter', apiKey: 'k' })).toBeNull()
    const c = parseOpenCodeModel('openai_compatible/llama3')!
    expect(credentialProblem(c, { kind: 'apiKey', provider: 'openai_compatible', apiKey: '' })).toMatch(/no address/)
    expect(credentialProblem(c, { kind: 'apiKey', provider: 'openai_compatible', apiKey: '', baseUrl: 'http://x/v1' })).toBeNull()
  })
})
