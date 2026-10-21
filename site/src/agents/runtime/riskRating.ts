/**
 * Risk rating for tool calls in the HITL audit log.
 *
 * Custom site-wide rules (from SiteConfig.riskRules) are evaluated first,
 * top-to-bottom, first match wins. Built-in defaults apply for anything not
 * covered by a custom rule.
 */

export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'FLAGGED'

export interface RiskRule {
  /** Substring matched against the bash command string, or exact tool name match. */
  pattern: string
  riskLevel: RiskLevel
}

// Built-in defaults ordered from highest to lowest risk.
// A command is tested against each pattern in order; first match wins.
export const BUILT_IN_RISK_RULES: RiskRule[] = [
  // FLAGGED — destructive / code-execution patterns
  { pattern: 'rm -rf',       riskLevel: 'FLAGGED' },
  { pattern: 'curl | bash',  riskLevel: 'FLAGGED' },
  { pattern: 'curl |bash',   riskLevel: 'FLAGGED' },
  { pattern: 'wget | bash',  riskLevel: 'FLAGGED' },
  { pattern: 'wget |bash',   riskLevel: 'FLAGGED' },
  { pattern: 'curl | sh',    riskLevel: 'FLAGGED' },
  { pattern: 'wget | sh',    riskLevel: 'FLAGGED' },
  { pattern: 'sudo ',        riskLevel: 'FLAGGED' },
  { pattern: 'chmod 777',    riskLevel: 'FLAGGED' },
  { pattern: 'dd if=',       riskLevel: 'FLAGGED' },
  { pattern: 'mkfs',         riskLevel: 'FLAGGED' },

  // HIGH — impactful but not immediately destructive
  { pattern: 'git push',     riskLevel: 'HIGH' },
  { pattern: 'kill -9',      riskLevel: 'HIGH' },
  { pattern: 'pkill ',       riskLevel: 'HIGH' },
  { pattern: 'curl ',        riskLevel: 'HIGH' },
  { pattern: 'wget ',        riskLevel: 'HIGH' },
  { pattern: 'rm ',          riskLevel: 'HIGH' },

  // MEDIUM — modifying or network ops
  { pattern: 'git commit',   riskLevel: 'MEDIUM' },
  { pattern: 'git merge',    riskLevel: 'MEDIUM' },
  { pattern: 'git rebase',   riskLevel: 'MEDIUM' },
  { pattern: 'npm install',  riskLevel: 'MEDIUM' },
  { pattern: 'yarn add',     riskLevel: 'MEDIUM' },
  { pattern: 'pnpm add',     riskLevel: 'MEDIUM' },
  { pattern: 'pip install',  riskLevel: 'MEDIUM' },
  { pattern: 'apt-get',      riskLevel: 'MEDIUM' },
  { pattern: 'chmod ',       riskLevel: 'MEDIUM' },
  { pattern: 'mv ',          riskLevel: 'MEDIUM' },
  { pattern: 'cp -r',        riskLevel: 'MEDIUM' },

  // LOW — minor writes or index ops
  { pattern: 'git add',      riskLevel: 'LOW' },
  { pattern: 'mkdir ',       riskLevel: 'LOW' },
  { pattern: 'touch ',       riskLevel: 'LOW' },
  { pattern: 'echo ',        riskLevel: 'LOW' },
  { pattern: 'cp ',          riskLevel: 'LOW' },

  // SAFE — read-only bash
  { pattern: 'git log',      riskLevel: 'SAFE' },
  { pattern: 'git status',   riskLevel: 'SAFE' },
  { pattern: 'git diff',     riskLevel: 'SAFE' },
  { pattern: 'git show',     riskLevel: 'SAFE' },
  { pattern: 'git blame',    riskLevel: 'SAFE' },
  { pattern: 'cat ',         riskLevel: 'SAFE' },
  { pattern: 'head ',        riskLevel: 'SAFE' },
  { pattern: 'tail ',        riskLevel: 'SAFE' },
  { pattern: 'ls ',          riskLevel: 'SAFE' },
  { pattern: 'ls\n',         riskLevel: 'SAFE' }, // bare ls
  { pattern: 'find ',        riskLevel: 'SAFE' },
  { pattern: 'grep ',        riskLevel: 'SAFE' },
  { pattern: 'pwd',          riskLevel: 'SAFE' },
]

// Canonical tool name → risk level for the runtime tools other than bash
const TOOL_RISK: Record<string, RiskLevel> = {
  read_file:  'SAFE',
  glob_files: 'SAFE',
  grep_files: 'SAFE',
  edit_file:  'LOW',
  write_file: 'LOW',
  web_search: 'LOW',
  web_fetch:  'LOW',
}

/**
 * Compute the risk level for a single tool call.
 *
 * @param toolName   Canonical tool name, as the gate passes it (e.g. 'bash', 'read_file', 'create_task')
 * @param toolInput  Raw tool input object
 * @param customRules  Site-wide custom rules evaluated before built-in defaults
 */
export function computeRiskLevel(
  toolName: string,
  toolInput: unknown,
  customRules: RiskRule[],
): RiskLevel {
  if (toolName === 'bash') {
    const cmd = (toolInput as { command?: string } | null)?.command ?? ''
    // Custom rules first
    for (const rule of customRules) {
      if (cmd.includes(rule.pattern)) return rule.riskLevel
    }
    // Built-in defaults
    for (const rule of BUILT_IN_RISK_RULES) {
      if (cmd.includes(rule.pattern)) return rule.riskLevel
    }
    // Unknown bash command — treat as MEDIUM to be cautious
    return 'MEDIUM'
  }

  // Runtime tools other than bash
  if (toolName in TOOL_RISK) return TOOL_RISK[toolName]

  // MCP tools and anything else — LOW by default
  return 'LOW'
}
