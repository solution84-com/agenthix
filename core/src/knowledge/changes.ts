/**
 * Who made a change to a page (G5). hq keeps it in its own record of each change and joins that record to a site's
 * versions by page, version and id; it never crosses to a site, which holds no identity store (ADR-0042).
 */
export type KnowledgeChangeAuthor =
  | { kind: 'person'; userId: string }
  | {
    kind: 'agent'
    agentId: string
    /** The person the agent was answering, or acting for; null for a run no person started. */
    forUserId: string | null
    /** The conversation the lead's turn was in, for a change the lead made. */
    conversationId?: string
    /** The run, for a change a worker made. */
    runId?: string
  }
