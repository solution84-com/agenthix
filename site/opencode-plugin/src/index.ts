/**
 * Agenthix's OpenCode plugin: the one plugin the OpenCode server loads, from
 * the agent image (`file:///usr/local/lib/agenthix/opencode/plugin/agenthix.js`).
 *
 * OpenCode's own permission system is, by its security policy, an aid for the
 * person at the terminal and not a security boundary, so Agenthix's gate is
 * here (spec, "Per-call authorization gate"):
 *
 * - every tool call is decided by the site before it runs (hooks.ts);
 * - every command carries its conversation's tag and none of the server's
 *   secrets (hooks.ts), on top of the launcher that contains it;
 * - every model request carries its turn's relay token, which the site's
 *   model relay exchanges for the provider's key, so no key is in the
 *   container at all (hooks.ts);
 * - `skill` is replaced, so a session loads only its own conversation's
 *   staged skills (skillTool.ts; spec §7);
 * - `read`, `write`, `edit` and `apply_patch` are replaced, so each opens its
 *   files first and uses one only if it is exactly the path the gate checked,
 *   which a symbolic link swapped in by a command cannot change (files/).
 *
 * A plugin tool takes the place of OpenCode's own tool of the same name, as
 * OpenCode documents; that it does is re-checked at every upgrade. How the
 * gate and skills work across both runtimes is written up in
 * `docs/architecture/tools/` and `docs/concepts/skills/`.
 *
 * It reads its configuration from its environment (`SITE_PLUGIN_CONFIG`).
 * Without a valid one every call is refused and every command too.
 */
// OpenCode calls every export of this module as a plugin, so it exports this one alone.
import { OPENCODE_PLUGIN_CONFIG_ENV, parseOpenCodePluginConfig } from '@agenthix/core'
import type { Plugin } from '@opencode-ai/plugin'
import { procFdPaths } from '@agenthix/core/file-tools'
import { agenthixHooks } from './plugin'
import { siteClient } from './site'

export const AgenthixPlugin: Plugin = async () => {
  const config = parseOpenCodePluginConfig(process.env[OPENCODE_PLUGIN_CONFIG_ENV])
  return agenthixHooks(config ? siteClient(config) : null, process.env, procFdPaths)
}
