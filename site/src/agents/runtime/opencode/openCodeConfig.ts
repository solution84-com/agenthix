/**
 * The OpenCode server's environment and configuration (spec "Deployment and
 * version pinning", "Keeping the gate whole", "Per-call authorization gate"
 * item 1, §6), rendered by the site from its own settings and passed in the
 * environment, never read from a file an agent could edit.
 *
 * What the server holds is the same for every conversation it serves: no
 * provider key and no provider's own address — every provider is addressed at
 * the site's model relay, which adds the turn's key to each request (§6) —
 * no conversation's tag (§3), and no tool connection (each conversation adds
 * its own, §2). The one thing that varies is the model names an
 * OpenAI-compatible endpoint offers, which OpenCode reads only from its
 * configuration.
 */
import type { CredentialProvider, OpenCodePluginConfig } from '@agenthix/core'
import type { SiteRunCredential } from '../../../server/modelRelay/runAccess'
import { CREDENTIAL_PROVIDERS, HARNESS_SERVER_KEY_ENV, OPENCODE_PLUGIN_CONFIG_ENV } from '@agenthix/core'
import { HARNESS_SECRET_ENV, OPENCODE_COMMAND_SHELL, OPENCODE_MODELS_FILE, OPENCODE_PLUGIN_URL } from '../agentImage'
import { openCodeProviderBaseUrl } from '../../../server/modelRelay/relayProviders'
import { INSTALL_ENV } from '../../../server/livePreviews/installs/installCommand'

/** The server's port on the container's loopback address. */
export const OPENCODE_SERVER_PORT = 4096

/** How the relay starts the server. The binary is on the image's `PATH`. */
export const OPENCODE_SERVE_ARGV: readonly string[] = ['opencode', 'serve', '--hostname', '127.0.0.1', '--port', String(OPENCODE_SERVER_PORT)]

/**
 * The key every configured provider is built with. OpenCode will not build a
 * provider with no key (`ProviderAuthError`); the relay drops it from every
 * request and sets the turn's real key in its place.
 */
export const OPENCODE_KEY_PLACEHOLDER = 'agenthix-key-arrives-with-each-request'

/** OpenCode's provider id for a person's own OpenAI-compatible endpoint. */
export const OPENCODE_COMPATIBLE_PROVIDER = 'openai_compatible'

/** The built-in providers, each configured with its address at the relay, so nothing in the home can redirect it (OPENCODE_MODELS_PATH covers the catalogue). */
const BUILT_IN_PROVIDERS = CREDENTIAL_PROVIDERS.filter(p => p !== OPENCODE_COMPATIBLE_PROVIDER)

/** The model names the server's OpenAI-compatible provider offers. Its address is the relay's; the endpoint's own is the credential's, and only the site holds it. */
export type CompatibleEndpoint = { models: string[] }

/** Deadlines the plugin puts on its calls to the site (OpenCode sets none on its hooks). */
const PLUGIN_GATE_TIMEOUT_MS = 30_000
const PLUGIN_TURN_TIMEOUT_MS = 10_000

/** The environment every server starts with, for the settings that are not per server. */
const FIXED_ENV: Readonly<Record<string, string>> = {
  HOME: '/home/appuser',
  OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
  OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
  OPENCODE_DISABLE_CLAUDE_CODE: '1',
  OPENCODE_DISABLE_PROJECT_CONFIG: '1',
  OPENCODE_DISABLE_MODELS_FETCH: '1',
  OPENCODE_DISABLE_SHARE: '1',
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
  OPENCODE_MODELS_PATH: OPENCODE_MODELS_FILE,
  OPENCODE_AUTH_CONTENT: '{}',
  npm_config_offline: 'true',
}

/**
 * Never in a server's environment: each would widen what OpenCode reaches or
 * runs (adr-0080; `execute` runs platform tools from a script, outside the
 * gate). Listed so a test can hold the rendered environment to it.
 */
export const FORBIDDEN_SERVER_ENV: readonly string[] = [
  'OPENCODE_ENABLE_EXA', 'OPENCODE_ENABLE_PARALLEL', 'OPENCODE_EXPERIMENTAL', 'OPENCODE_EXPERIMENTAL_CODE_MODE',
  'OPENCODE_AUTO_SHARE', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'SITE_SESSION',
]

export interface ServerSettings {
  /** The password the server requires; generated per server. */
  password: string
  /** The server's key for the plugin's turn call (openCodeTurns.ts). */
  serverKey: string
  /** The agent-facing site address, without a trailing slash. */
  siteUrl: string
  compatible: CompatibleEndpoint | null
}

export function renderOpenCodeConfig(siteUrl: string, compatible: CompatibleEndpoint | null): Record<string, unknown> {
  const provider: Record<string, unknown> = {}
  for (const id of BUILT_IN_PROVIDERS) {
    provider[id] = { options: { baseURL: openCodeProviderBaseUrl(siteUrl, id), apiKey: OPENCODE_KEY_PLACEHOLDER } }
  }
  if (compatible) {
    provider[OPENCODE_COMPATIBLE_PROVIDER] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'OpenAI-compatible endpoint',
      options: { baseURL: openCodeProviderBaseUrl(siteUrl, OPENCODE_COMPATIBLE_PROVIDER), apiKey: OPENCODE_KEY_PLACEHOLDER },
      models: Object.fromEntries(compatible.models.map(m => [m, { name: m, tool_call: true }])),
    }
  }
  return {
    share: 'disabled',
    autoupdate: false,
    // Snapshots (undo, and the diffs OpenCode reports) keep a git folder in
    // the server's home, which the image's contained `git` cannot reach, and
    // Agenthix uses neither.
    snapshot: false,
    enabled_providers: Object.keys(provider),
    provider,
    // OpenCode never asks: every call is decided by Agenthix's plugin. Only
    // what the model must not see is denied, with pattern `*`, which hides it;
    // `skill` is denied here to drop OpenCode's own skills list from the
    // prompt, and every session allows it again (spec §7).
    permission: { '*': 'allow', task: 'deny', question: 'deny', skill: 'deny' },
    plugin: [OPENCODE_PLUGIN_URL],
    shell: OPENCODE_COMMAND_SHELL,
  }
}

export function renderPluginConfig(siteUrl: string): OpenCodePluginConfig {
  return {
    siteUrl,
    gateTimeoutMs: PLUGIN_GATE_TIMEOUT_MS,
    turnTimeoutMs: PLUGIN_TURN_TIMEOUT_MS,
    // The plugin's own configuration is not secret, but it is the server's,
    // and nothing a command needs.
    secretEnv: [...HARNESS_SECRET_ENV, OPENCODE_PLUGIN_CONFIG_ENV],
    // The server runs npm offline so OpenCode installs nothing; an agent's
    // own installs follow the site's network policy instead, with install
    // scripts off (adr-0170): `install_packages` runs those that pass the rule.
    commandEnv: { npm_config_offline: 'false', ...INSTALL_ENV },
  }
}

export function renderServerEnv(settings: ServerSettings): Record<string, string> {
  return {
    ...FIXED_ENV,
    OPENCODE_SERVER_PASSWORD: settings.password,
    [HARNESS_SERVER_KEY_ENV]: settings.serverKey,
    [OPENCODE_PLUGIN_CONFIG_ENV]: JSON.stringify(renderPluginConfig(settings.siteUrl)),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(renderOpenCodeConfig(settings.siteUrl, settings.compatible)),
  }
}

/** A turn's model, as OpenCode addresses it: `<provider>/<model>`, the model id kept whole (`qwen/…:free`). */
export type OpenCodeModel = { providerID: string; modelID: string; provider: CredentialProvider }

export function parseOpenCodeModel(model: string): OpenCodeModel | null {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) return null
  const providerID = model.slice(0, slash)
  const modelID = model.slice(slash + 1)
  const provider = CREDENTIAL_PROVIDERS.find(p => p === providerID)
  return provider ? { providerID, modelID, provider } : null
}

/**
 * Why a turn cannot run on this credential, or null when it can: the
 * credential must be an API key for the model's own provider (hq resolves one
 * per provider, §6); a subscription is Claude's runtime's alone.
 */
export function credentialProblem(model: OpenCodeModel, credential: SiteRunCredential | null): string | null {
  if (!credential) return `No model credential is configured for ${model.provider}. Add an API key for it and run this again.`
  if (credential.kind === 'subscription') return 'A Claude subscription can only be used by the Claude runtime. Add an API key for this provider.'
  if (credential.kind === 'cloud') return 'This Execution Site cannot run a model through Agenthix Cloud on OpenCode yet.'
  if (credential.provider !== model.provider) {
    return `The run was given a ${credential.provider} credential for a ${model.provider} model.`
  }
  if (model.provider === 'openai_compatible' && !credential.baseUrl) return 'The OpenAI-compatible endpoint has no address configured.'
  return null
}
