/**
 * The settings an agent made from a template starts with. Installing grants no capability (R10): only a template from
 * hq's image keeps what its `agent.json` asks for. Any other (an upload, a link, one made here) starts its agents on
 * the defaults: its `bypassed` becomes Deferred and its tool and Bash permission lists are ignored, so nothing it
 * names runs without asking. An administrator can change either on the agent's page.
 */
import { defaultAgentSettings, type AgentSettings } from '../../packages/agentPackageService'
import { coerceToolPermissions, coerceBashPatternPermissions } from '../../agents/toolPermissions'
import type { AgentTemplateFile } from '../install/templateFiles'

type TemplateAgentSettings = Pick<AgentTemplateFile, 'approval' | 'allowedTools' | 'allowedBashPatterns'>

export function templateAgentSettings(agent: TemplateAgentSettings, fromImage: boolean): AgentSettings {
  const defaults = defaultAgentSettings()
  if (!fromImage) return { ...defaults, approval: agent.approval === 'bypassed' ? defaults.approval : agent.approval }
  return {
    ...defaults,
    approval: agent.approval,
    permissions: {
      // A legacy string[] (before tool states) is coerced as archive imports do.
      tools: agent.allowedTools ? coerceToolPermissions(agent.allowedTools) : null,
      bashPatterns: agent.allowedBashPatterns ? coerceBashPatternPermissions(agent.allowedBashPatterns) : null,
    },
  }
}
