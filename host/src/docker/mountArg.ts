/** The `--mount` argument Docker takes, with a path or name that holds a comma or a quote quoted as its CSV reader needs. */

export type Mount =
  | { type: 'bind'; source: string; destination: string; readOnly: boolean }
  | { type: 'volume'; name: string; destination: string; readOnly: boolean }

/** One field of `--mount`, quoted as Docker's CSV reader takes it when it holds a comma or a quote. */
const field = (key: string, value: string) => {
  const kv = `${key}=${value}`
  return /[",]/.test(kv) ? `"${kv.replace(/"/g, '""')}"` : kv
}

export function mountArg(m: Mount): string {
  const src = m.type === 'bind' ? field('src', m.source) : field('src', m.name)
  return [`type=${m.type}`, src, field('dst', m.destination), ...(m.readOnly ? ['readonly'] : [])].join(',')
}
