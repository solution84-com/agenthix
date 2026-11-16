/**
 * What an agent's tool is about (lean agent context spec, *The area lines*): each tool's declaration names one, so a
 * tool is placed when it is written. An area is never sent as part of the tool to the model; the tool search builds
 * the short lines that name what else an agent can do from the areas it has a tool in.
 */
export const TOOL_AREAS = [
  'tasks', 'planning', 'knowledge', 'memory', 'organisation', 'code', 'apps', 'workflows', 'skills', 'conversation', 'run',
] as const

export type ToolArea = (typeof TOOL_AREAS)[number]
