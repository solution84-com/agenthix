/**
 * The OpenCode runtime (adr-0073): the runtime behind every model that is not
 * Claude on a subscription, behind the same interface as ClaudeSDKRuntime
 * (adr-0019), for chat, task runs alike (spec §8).
 *
 * A turn runs on its container's one OpenCode server (opencode/openCodeServers.ts),
 * in the conversation's own OpenCode session, with its own platform-tool
 * connection. For the turn, the site points the conversation's platform token
 * at the run's capability, registers the run with the gate, issues the turn a
 * relay token for the site's model relay, which adds the provider's key to
 * each model request (spec §6), and hands the plugin the turn — the
 * conversation, the platform token and the relay token — which it asks for
 * itself (opencode/openCodeTurns.ts). When the turn ends, the tokens and the
 * turn resolve to nothing again (adr-0082).
 *
 * Only under container isolation: an agent's commands are contained by the
 * image's launcher (spec "Keeping the gate whole"), which a run on this
 * machine would not have.
 */
import type { AgentRuntime, ConversationRef, RunContext, RunEvent, SessionExistenceQuery } from './types'
import { pointConversationToken, clearConversationTurn } from '../../server/runtime/conversationTokens'
import { registerGateRun } from './toolGateRuns'
import { openCodeServers, type OpenCodeServers } from './opencode/openCodeServers'
import { credentialProblem, isConfiguredProvider, parseOpenCodeModel } from './opencode/openCodeConfig'
import { openCodeConnectionName } from './opencode/openCodeConnection'
import { openCodeHiddenBuiltins, openCodeHiddenPlatformTools } from './opencode/openCodeNames'
import { clearOpenCodeTurn, recordOpenCodeSession, setOpenCodeTurn } from './opencode/openCodeTurns'
import { openCodeSessionExists, openCodeSessionForTurn, prismaHarnessSessionStore, type HarnessSessionStore } from './opencode/openCodeSessions'
import { runOpenCodeTurn } from './opencode/openCodeTurn'
import { ReadableRunError } from './readableRunError'
import { turnPrompt } from './pickedSkill'
import { openCodeSkillsDirs, stageOpenCodeSkills } from './opencode/openCodeSkills'
import { setOpenCodeSkillsDir } from './opencode/openCodeGate'
import { issueRelayToken, pointRelayToken, revokeRelayToken, turnModelCredentials } from '../../server/modelRelay/relayTokens'
import { RELAY_TOKEN_HEADER } from '../../server/modelRelay/relayProviders'
import { NO_WEB_SEARCH_INSTRUCTIONS } from '@agenthix/core'

const NEEDS_CONTAINER = 'The OpenCode runtime runs only in an agent container (AGENT_CONTAINER_ISOLATION), where its commands can be contained.'

export interface OpenCodeRuntimeDeps {
  servers: OpenCodeServers
  store: HarnessSessionStore
  /** Stages the turn's skills; the real staging by default. */
  stageSkills?: typeof stageOpenCodeSkills
}

export class OpenCodeRuntime implements AgentRuntime {
  constructor(private readonly deps: OpenCodeRuntimeDeps = { servers: openCodeServers, store: prismaHarnessSessionStore }) {}

  async sessionExists(query: SessionExistenceQuery): Promise<boolean> {
    if (!query.containerName) throw new Error(NEEDS_CONTAINER)
    const row = await this.deps.store.read(query.sessionId)
    if (!row?.harnessSessionId) return false
    const { servers } = this.deps
    let exists = false
    try {
      await servers.ensureServer(query.containerName, null)
      exists = await openCodeSessionExists(servers, query.containerName, row.harnessSessionId, query.workingDirectory)
      return exists
    } finally {
      // A found session is resumed by the run that follows, which uses this server; a run that fails first stops it (run()).
      if (!exists) await servers.stopIfUnused(query.containerName)
    }
  }

  async conversationIdle(conversation: ConversationRef): Promise<void> {
    if (conversation.containerName) await this.deps.servers.releaseConversation(conversation.containerName, conversation.sessionId)
  }

  async endConversation(conversation: ConversationRef): Promise<void> {
    if (conversation.containerName) await this.deps.servers.releaseConversation(conversation.containerName, conversation.sessionId)
  }

  /** Refuses a run that cannot go ahead, and has the server up for one that can. */
  private async prepare(context: RunContext) {
    const { servers } = this.deps
    const containerName = context.containerName
    if (!containerName) throw new Error(NEEDS_CONTAINER)
    try {
      const model = parseOpenCodeModel(context.model)
      if (!model) throw new Error(`'${context.model}' is not a model OpenCode can run: name it with its provider, such as openrouter/<model>.`)
      const problem = credentialProblem(model, context.credential)
      if (problem) throw new ReadableRunError(problem)
      if (!context.capability) throw new Error('The run has no capability to act with.')

      await servers.ensureServer(containerName, isConfiguredProvider(model.provider) ? { provider: model.provider, model: model.modelID } : null)
      return { containerName, model, capability: context.capability }
    } catch (err) {
      // The existence check may have started the server for this run, which never got to hold it.
      await servers.stopIfUnused(containerName)
      throw err
    }
  }

  async *run(context: RunContext): AsyncIterable<RunEvent> {
    const { servers, store } = this.deps
    const { containerName, model, capability } = await this.prepare(context)

    servers.turnStarted(containerName, context.sessionId)
    const token = pointConversationToken(context.sessionId, context.runId, capability)
    registerGateRun(context)
    const relayToken = issueRelayToken(containerName, context.sessionId)
    pointRelayToken(relayToken, context.runId, turnModelCredentials(context), context.billingProfileId ?? null, context.features)
    const connectionName = openCodeConnectionName(context.sessionId)
    let openCodeSessionId: string | null = null
    try {
      const platform = context.mcpServers?.platform
      if (platform) {
        await servers.ensureConnection(containerName, context.sessionId, { name: connectionName, token, directory: context.cwd, url: platform.url, toolSet: context.codeWork ? 'code' : 'plain' })
      }
      const staged = await (this.deps.stageSkills ?? stageOpenCodeSkills)(context, context.sessionId)
      setOpenCodeSkillsDir(context.sessionId, staged.skills.length ? openCodeSkillsDirs(context.runStaging, context.sessionId).visibleDir : null)
      openCodeSessionId = await openCodeSessionForTurn(servers, store, containerName, {
        sessionId: context.sessionId,
        directory: context.cwd,
        prompt: context.prompt,
        connectionName,
        hiddenTools: [...openCodeHiddenBuiltins(context), ...openCodeHiddenPlatformTools(context, connectionName)],
      })
      recordOpenCodeSession(openCodeSessionId, { containerName, conversationId: context.sessionId, connectionName })
      setOpenCodeTurn(openCodeSessionId, {
        conversationId: context.sessionId,
        conversationToken: token,
        modelHeaders: { [RELAY_TOKEN_HEADER]: relayToken },
      })
      yield* runOpenCodeTurn(servers, {
        containerName,
        openCodeSessionId,
        connectionName,
        model,
        context: { ...context, prompt: turnPrompt(context, staged.invocable) },
        // A turn with no search key is not shown web_search (openCodeHiddenPlatformTools), and is told why.
        system: [context.agent.systemPrompt, staged.systemSection, context.webSearchKey ? null : NO_WEB_SEARCH_INSTRUCTIONS]
          .filter(Boolean).join('\n\n') || undefined,
      })
    } finally {
      if (openCodeSessionId) clearOpenCodeTurn(openCodeSessionId, token)
      revokeRelayToken(relayToken)
      clearConversationTurn(context.sessionId, context.runId)
      servers.turnEnded(containerName)
    }
  }
}
