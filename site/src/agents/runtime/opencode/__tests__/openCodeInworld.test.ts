/**
 * A model through Inworld on OpenCode: its provider block at the relay, the model named so its id reaches Inworld as
 * the list gives it, the flag, and the key never in what the harness is given.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site' }))
vi.mock('../../landlockCheck', () => ({ requireLandlock: vi.fn() }))

import { OPENCODE_KEY_PLACEHOLDER, credentialProblem, parseOpenCodeModel, renderOpenCodeConfig } from '../openCodeConfig'
import { OpenCodeRuntime } from '../../OpenCodeRuntime'
import { OpenCodeServers } from '../openCodeServers'
import { fakeDeps, json, type FakeRelay } from './fakeRelay'
import { resetOpenCodeTurnsForTests, resolveHarnessTurn } from '../openCodeTurns'
import { resetGateRunsForTests } from '../../toolGateRuns'
import { resolveRelayToken } from '../../../../server/modelRelay/relayTokens'
import { claudeCredentialProblem } from '../../claude/claudeStart'
import type { RunContext, RunEvent } from '../../types'

const SITE = 'http://host.docker.internal:4201'
const REAL_KEY = 'iw-REAL-KEY-never-in-a-container'
const INWORLD = { kind: 'apiKey', providerId: 'prov-iw', provider: 'inworld', apiKey: REAL_KEY } as const
const HOSTED = 'inworld/models/deepseek-v4-flash'
const CLAUDE = 'anthropic/claude-sonnet-5'

describe("Inworld in OpenCode's configuration @SC-1867", () => {
  it('is an OpenAI-compatible provider at the relay, with a placeholder key and each model under its id as Inworld lists it', () => {
    const config = renderOpenCodeConfig(SITE, { inworld: [CLAUDE, HOSTED] }) as Record<string, any>
    expect(config.enabled_providers).toContain('inworld')
    expect(config.provider.inworld).toEqual({
      npm: '@ai-sdk/openai-compatible',
      name: 'Inworld',
      options: { baseURL: `${SITE}/api/v1/model-relay/inworld`, apiKey: OPENCODE_KEY_PLACEHOLDER, includeUsage: true },
      models: { [CLAUDE]: { name: CLAUDE, tool_call: true }, [HOSTED]: { name: HOSTED, tool_call: true } },
    })
    expect(JSON.stringify(config)).not.toMatch(/api\.inworld\.ai/)
  })

  it('is absent until a turn needs one of its models', () => {
    expect((renderOpenCodeConfig(SITE, {}) as Record<string, any>).enabled_providers).not.toContain('inworld')
  })

  it("reads `inworld/<id>` with the id kept whole, two slashes included, as OpenRouter's ids are", () => {
    expect(parseOpenCodeModel(`inworld/${HOSTED}`)).toEqual({ providerID: 'inworld', modelID: HOSTED, provider: 'inworld' })
    expect(parseOpenCodeModel(`inworld/${CLAUDE}`)).toEqual({ providerID: 'inworld', modelID: CLAUDE, provider: 'inworld' })
    expect(parseOpenCodeModel('openrouter/anthropic/claude-sonnet-5')).toMatchObject({ providerID: 'openrouter', modelID: CLAUDE })
  })

  it('runs only on an Inworld key', () => {
    const model = parseOpenCodeModel(`inworld/${CLAUDE}`)!
    expect(credentialProblem(model, INWORLD)).toBeNull()
    expect(credentialProblem(model, { kind: 'apiKey', provider: 'anthropic', apiKey: 'k' })).toMatch(/anthropic credential for a inworld model/)
    expect(credentialProblem(model, null)).toMatch(/No model credential is configured for inworld/)
  })
})

describe('the Claude runtime and a key for another provider @SC-1868', () => {
  it('refuses an Inworld key, Claude model or not, and takes an Anthropic one', () => {
    expect(claudeCredentialProblem(INWORLD)).toMatch(/inworld key.*runs on OpenCode/)
    expect(claudeCredentialProblem({ kind: 'apiKey', provider: 'anthropic', apiKey: 'k' })).toBeNull()
    expect(claudeCredentialProblem({ kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'g', loginId: 'l' })).toBeNull()
    expect(claudeCredentialProblem(null)).toBeNull()
  })
})

describe('an OpenCode turn on a model through Inworld', () => {
  const C = 'agent-c1'
  beforeEach(() => {
    resetOpenCodeTurnsForTests()
    resetGateRunsForTests()
  })

  function context(over: Partial<RunContext> = {}): RunContext {
    return {
      runId: 'run-1', sessionId: 'conv-1', taskId: null, projectId: null,
      model: `inworld/${HOSTED}`, prompt: 'Say ok',
      agent: { id: 'a', handle: 'ada', name: 'Ada', systemPrompt: 'You are Ada.', defaultModel: `inworld/${HOSTED}` },
      containerName: C, cwd: '/projects/p1/files',
      mcpServers: { platform: { type: 'http', url: 'http://site/mcp', headers: { Authorization: 'Bearer run-token' } } },
      capability: { jwt: 'jwt', expiresAt: Date.now() + 600_000 },
      credential: INWORLD, features: { inworldLanguageModels: true },
      riskRules: null, packages: {} as RunContext['packages'], boundaryOverride: null, skills: null,
      claudeHome: { serverDir: '/h', visibleDir: '/home/appuser' }, runStaging: { serverDir: '/s', visibleDir: '/run/staging' }, workingTreeDir: '/w',
      abortSignal: new AbortController().signal,
      ...over,
    }
  }

  function servers(during: (relay: FakeRelay) => void) {
    let relay: FakeRelay | undefined
    const { deps, relays } = fakeDeps(c => {
      relay = relays[0]
      if (c.path.startsWith('/mcp?')) return json(200, { [(c.body as { name: string }).name]: { status: 'connected' } })
      if (c.path.startsWith('/session?')) return json(200, { id: 'ses_new' })
      if (c.path.includes('/prompt_async')) {
        setTimeout(() => {
          during(relay!)
          relay!.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm2', sessionID: 'ses_new', role: 'assistant', providerID: 'inworld', modelID: HOSTED } } })
          relay!.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
        }, 1)
        return { status: 204, body: '' }
      }
      return undefined
    })
    return { servers: new OpenCodeServers(deps), relays }
  }

  const store = () => ({ read: async () => null, write: async () => {} })
  const noSkills = async () => ({ skills: [], systemSection: null, invocable: [] })
  async function collect(it: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
    const out: RunEvent[] = []
    for await (const e of it) out.push(e)
    return out
  }

  it('configures the model, names it to OpenCode as Inworld lists it, and gives the harness no key @SC-1866 @SC-1867', async () => {
    let harnessTurn: unknown
    let relayTurn: ReturnType<typeof resolveRelayToken> = null
    const { servers: s, relays } = servers(relay => {
      const turn = resolveHarnessTurn(relay.starts[0].env.SITE_HARNESS_KEY, 'ses_new')
      harnessTurn = turn
      relayTurn = resolveRelayToken(turn?.modelHeaders['x-agenthix-turn'] ?? '')
    })
    const events = await collect(new OpenCodeRuntime({ servers: s, store: store(), stageSkills: noSkills }).run(context()))

    expect(events.at(-1)).toEqual({ type: 'status', status: 'completed', model: `inworld/${HOSTED}` })
    const start = relays[0].starts[0]
    const config = JSON.parse(start.env.OPENCODE_CONFIG_CONTENT)
    expect(Object.keys(config.provider.inworld.models)).toEqual([HOSTED])
    const prompt = relays[0].calls.find(c => c.path.includes('/prompt_async'))!
    expect((prompt.body as { model: unknown }).model).toEqual({ providerID: 'inworld', modelID: HOSTED })

    // Nothing the harness is given holds the key: its server's environment and configuration, any call to it, or
    // the plugin's turn, which carries only the relay token.
    expect(JSON.stringify(start)).not.toContain(REAL_KEY)
    expect(JSON.stringify(relays[0].calls)).not.toContain(REAL_KEY)
    expect(Object.keys((harnessTurn as { modelHeaders: object }).modelHeaders)).toEqual(['x-agenthix-turn'])
    expect(JSON.stringify(harnessTurn)).not.toContain(REAL_KEY)
    // The relay holds it, for the turn only.
    expect(relayTurn!.credentials.get('inworld')).toEqual(INWORLD)
  })

  it('refuses the turn while Inworld models are off, before a server starts', async () => {
    const { servers: s, relays } = servers(() => {})
    await expect(collect(new OpenCodeRuntime({ servers: s, store: store(), stageSkills: noSkills }).run(context({ features: {} }))))
      .rejects.toThrow(/not on for this organisation/)
    expect(relays).toHaveLength(0)
  })
})
