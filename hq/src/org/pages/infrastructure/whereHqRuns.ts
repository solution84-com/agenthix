export type WhereHqRunsAnswer = { hosting: 'self' | 'cloud'; connectedAs: string | null }

/** "Where HQ runs", in a line: who looks after the machine, and what Agenthix Cloud is to it. */
export function whereHqRunsLine({ hosting, connectedAs }: WhereHqRunsAnswer): string {
  if (hosting === 'cloud') return 'On Agenthix Cloud · Cloud keeps HQ up to date and backed up'
  if (connectedAs) return `Self-hosted · connected to Agenthix Cloud as ${connectedAs}`
  return "Self-hosted · Agenthix Cloud can run it instead — fleet admins see how on HQ's page in the Fleet Console"
}
