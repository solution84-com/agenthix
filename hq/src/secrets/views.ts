/**
 * What the Secrets and variables screens are given (spec part 5, U6): names, descriptions, kinds, dates, who changed
 * what and *Used by*. A secret's view has no value and no ciphertext; a variable's has its value. Types only, so the
 * client may import them.
 */

export type ValueKind = 'secret' | 'variable'
export type RotationState = 'none' | 'due_soon' | 'overdue'
export type PersonRef = { id: string; name: string }
export type UsingWorkflowView = { id: string; name: string; enabled: boolean }

export type SecretView = {
  name: string
  /** `from_github`: minted for each run by the integration; it can't be set or replaced. */
  kind: 'text' | 'file' | 'from_github'
  description: string
  issuer: string
  renewAt: string
  rotateBy: Date | null
  rotation: RotationState
  /** When the value was set or last replaced, and by whom; null for an integration's. */
  changedAt: Date | null
  changedBy: PersonRef | null
  usedBy: UsingWorkflowView[]
}

export type VariableView = {
  name: string
  value: string
  changedAt: Date
  changedBy: PersonRef
  usedBy: UsingWorkflowView[]
}

export type PlaceSecretsView = { mayChange: boolean; secrets: SecretView[] }
export type PlaceVariablesView = { mayChange: boolean; variables: VariableView[] }

export type SecretRecordView = {
  action: 'set' | 'replaced' | 'deleted' | 'used' | 'printed' | 'turned_off_users'
  by: PersonRef | null
  runId: string | null
  at: Date
}

export type VariableChangeView = {
  action: 'set' | 'changed' | 'deleted'
  oldValue: string | null
  newValue: string | null
  by: PersonRef
  at: Date
}

export type VariableSaveView =
  | { saved: true; variable: { name: string; value: string } }
  | { saved: false; looksLikeSecret: string; question: string }

export type TurnedOffView = {
  workflows: UsingWorkflowView[]
  runsStopped: number
  next: string
}
