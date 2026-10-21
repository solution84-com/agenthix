import type { OperationOwner } from '../contract'

/** A placeholder owner while its lane builds it: refuses, never pretends. */
export function notBuiltOwner(kind: string): OperationOwner {
  const refuse = async (): Promise<void> => {
    throw new Error(`${kind} operations cannot be stopped or answered yet`)
  }
  return { cancel: refuse, answerApproval: refuse }
}
