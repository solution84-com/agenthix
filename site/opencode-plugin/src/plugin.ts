/**
 * The plugin's hooks and tools, assembled from what they need: the site
 * client (null without a valid configuration, when everything fails closed),
 * the environment, and how descriptors are named. index.ts gives them the real
 * ones; tests give their own.
 */
import { OPENCODE_PLUGIN_CONFIG_ENV, parseOpenCodePluginConfig } from '@agenthix/core'
import type { Hooks } from '@opencode-ai/plugin'
import { gateHook, headersHook, shellEnvHook } from './hooks'
import { applyPatchTool } from './files/applyPatchTool'
import { InstructionFiles } from './files/instructions'
import { readTool } from './files/readTool'
import type { FdPaths } from '@agenthix/core/file-tools'
import { editTool, writeTool } from './files/writeTools'
import type { SiteClient } from './site'
import { skillTool } from './skillTool'

export function agenthixHooks(site: SiteClient | null, env: NodeJS.ProcessEnv, sys: FdPaths): Hooks {
  const config = parseOpenCodePluginConfig(env[OPENCODE_PLUGIN_CONFIG_ENV])
  return {
    'tool.execute.before': gateHook(site),
    'shell.env': shellEnvHook(site, config),
    'chat.headers': headersHook(site),
    tool: {
      skill: skillTool(sys, site),
      read: readTool(sys, new InstructionFiles(sys, env)),
      write: writeTool(sys),
      edit: editTool(sys),
      apply_patch: applyPatchTool(sys),
    },
  }
}
