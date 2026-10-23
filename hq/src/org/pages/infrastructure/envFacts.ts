type EnvKey = { key: string; set: boolean; required: string }
type EnvSection = { label: string; keys: EnvKey[] }

/** How each `required` bucket reads. A key added on the server shows its own name until it is given words here. */
export const REQUIRED_LABELS: Record<string, string> = {
  always: 'required',
  production: 'required in production',
  optional: 'optional',
}

export const isKeySet = (sections: EnvSection[] | undefined, key: string): boolean | undefined =>
  sections?.flatMap(s => s.keys).find(k => k.key === key)?.set

/** "4 of 5 required keys set" — the keys that are always required, or required in production. */
export function requiredKeysLine(sections: EnvSection[]): string {
  const required = sections.flatMap(s => s.keys).filter(k => k.required === 'always' || k.required === 'production')
  const set = required.filter(k => k.set).length
  return `${set} of ${required.length} required keys set`
}
