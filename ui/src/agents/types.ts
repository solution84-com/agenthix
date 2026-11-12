import { CLAUDE_SDK_MODELS, CLAUDE_SDK_RUNTIME, DEFAULT_MODELS } from '@agenthix/core'
import type { PictureRecipeView } from '@agenthix/core'

export interface CreateAgentInput {
  siteId: string
  name: string
  handle: string
  role?: string
}

export interface CreateAgentActions {
  createAgent: (input: CreateAgentInput) => Promise<{ id: string; handle: string }>
}

/** The Claude runtime's models; the override form's default list. */
export const AGENT_MODELS = CLAUDE_SDK_MODELS

export const DEFAULT_AGENT_RUNTIME = CLAUDE_SDK_RUNTIME
export const DEFAULT_AGENT_MODEL = DEFAULT_MODELS[DEFAULT_AGENT_RUNTIME]

// ── Agent detail ─────────────────────────────────────────────────────────────

export interface AgentRun {
  id: string
  /** The session this run belongs to — needed to route session-anchored reads (e.g. getToolCallLog) to the site that holds it. */
  sessionId: string
  status: string
  inputText: string
  outputText: string | null
  model: string
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  auditSummary: unknown
  manifestStatus: string | null
  /** The fingerprint (digest) of the agent content the run used. */
  agentPackageDigest?: string | null
}

export interface AgentTask {
  id: string
  title: string
  state: string
  priority: string
  runState: string
  project: { id: string; name: string } | null
}

export interface AgentSession {
  id: string
  title: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface AgentDetail {
  id: string
  name: string
  handle: string
  role: string | null
  defaultModel: string
  runtime: string
  isKernel: boolean
  allowedTools: unknown
  allowedBashPatterns: unknown
  approval: string
  hqAgentId: string | null
  createdAt: string
  updatedAt: string
  sessionCount: number
  runCount: number
  totalTokens: number
  taskCounts: { idle: number; running: number; blocked: number; done: number; failed: number }
  sessions: AgentSession[]
  runs: AgentRun[]
  assignedTasks: AgentTask[]
  avatarUrl?: string | null
  coverUrl?: string | null
  /** The recipes its pictures were drawn from, for the picker; null for an upload. */
  avatarRecipe?: PictureRecipeView | null
  coverRecipe?: PictureRecipeView | null
}

export type AgentDetailTab =
  | 'overview' | 'prompt' | 'skills' | 'memory'
  | 'configuration' | 'permissions' | 'financial' | 'runs' | 'voice'

export interface AgentChatStats {
  runningCount: number
}
