import { parse } from 'yaml'

/**
 * Reads `workflow.yaml` into plain data for core's `parseWorkflowDefinition`. hq reads YAML here and only here, once,
 * at proposal; the parsed definition is what is hashed and sent on. YAML 1.2's core schema with no custom tags,
 * duplicate keys refused, and no aliases, which would let a small file expand to a huge one.
 */
export type YamlReading = { ok: true; data: unknown } | { ok: false; message: string }

export type YamlReader = (text: string) => YamlReading

export const readWorkflowYaml: YamlReader = text => {
  try {
    return { ok: true, data: parse(text, { schema: 'core', uniqueKeys: true, maxAliasCount: 0, customTags: [] }) }
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return { ok: false, message: `workflow.yaml can't be read: ${reason}. Nothing was changed.` }
  }
}
