/**
 * Why the secret store refused something, in words a person can act on: what is wrong, who holds it, what to do, and
 * "Nothing was changed." The message never holds a value.
 */
export type SecretsRefusalCode = 'not_allowed' | 'not_found' | 'exists' | 'invalid' | 'in_use' | 'unreadable'

export class SecretsRefusal extends Error {
  constructor(readonly code: SecretsRefusalCode, message: string, readonly workflows: string[] = []) {
    super(message)
    this.name = 'SecretsRefusal'
  }
}

export const NOTHING_CHANGED = 'Nothing was changed.'

export function refuse(code: SecretsRefusalCode, message: string, workflows: string[] = []): never {
  throw new SecretsRefusal(code, `${message} ${NOTHING_CHANGED}`, workflows)
}
