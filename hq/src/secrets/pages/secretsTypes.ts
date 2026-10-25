/** The shapes the Secrets and variables screens read, from the server's own view types (type-only: nothing is bundled). */
import type { WorkspaceOwnerType } from '@prisma/client'

export type { SecretView, VariableView, SecretRecordView, VariableChangeView, UsingWorkflowView, TurnedOffView, ValueKind } from '../views'

export type SecretsPlace = { type: WorkspaceOwnerType; id: string }
