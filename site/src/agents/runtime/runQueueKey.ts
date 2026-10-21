/**
 * Which runs must not execute at the same time: the turns of one conversation,
 * and nothing else (ADR-0075).
 *
 * A harness transcript has one writer. Two turns of one session at once would
 * both append to it — OpenCode refuses that outright, and Claude Code resumes
 * the session file the other turn is still writing. So a session's runs queue
 * behind each other, and every other pair of runs — two people in one project,
 * one person's two conversations in one container, a task beside a chat, a
 * subagent beside its parent — runs at once, bounded only by the site-wide cap
 * (`GlobalSlots`, AgentEngine.ts) and each container's resource limits
 * (containerLimits.ts), which protect the machine and are not an ordering.
 *
 * What made runs in one boundary wait for each other before — a container and
 * a Claude home shared by everyone in the boundary — is carried elsewhere now:
 * a process belongs to the conversation that started it and ends with it
 * (adr-0083, conversationLifecycle.ts), and the run's credential leaves the
 * home only when the last run using it ends (runCleanup.ts).
 *
 * Process-local, like the queue itself (runQueue.ts).
 */
/**
 * @param session the run's session row, or null when it could not be read — see
 *   the fallback below.
 */
export function runQueueKey(
  session: { id: string } | null | undefined,
  runId: string,
): string {
  // No session row: the launch is handed this same null and refuses the run
  // before any container is prepared (agentUtils.ts). A key of its own means it
  // waits for nothing and blocks nothing on its way to failing.
  if (!session) return `run:${runId}`

  return `session:${session.id}`
}
