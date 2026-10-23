/**
 * Who may write a provider, and the record each write leaves (part 1). hq's provider store accepts a write only from
 * one of three named actors, checks that actor's authority itself, and refuses any other; `hq` itself only moves a
 * provider's state when a call or a check says so. Every write and every change of state is a record, shown on the
 * provider in hq's admin area.
 * - `organisation_admin`: a signed-in person holding the organisation admin role; the store checks the role again;
 * - `machine`: whoever can run commands on hq's machine, through hq's control socket;
 * - `cloud_controller`: Agenthix Cloud's controller, on a machine it runs.
 */
export const PROVIDER_WRITERS = ['organisation_admin', 'machine', 'cloud_controller'] as const
export type ProviderWriterKind = (typeof PROVIDER_WRITERS)[number]

/** The actor a provider write names. */
export type ProviderActor =
  | { kind: 'organisation_admin'; userId: string }
  | { kind: 'machine' }
  | { kind: 'cloud_controller' }

/** A record's actor: one of the writers, or hq itself for a change of state. */
export type ProviderRecordActorKind = ProviderWriterKind | 'hq'

export const PROVIDER_RECORD_ACTIONS = ['added', 'key_replaced', 'renamed', 'removed', 'revoked', 'state_changed'] as const
export type ProviderRecordAction = (typeof PROVIDER_RECORD_ACTIONS)[number]

/** One record, as it is shown. `by` is the person, when there is one. */
export type ProviderRecordView = {
  id: string
  at: string
  providerId: string
  /** The provider's name when the record was written; it outlives the provider. */
  providerName: string
  action: ProviderRecordAction
  actor: ProviderRecordActorKind
  by: { id: string; name: string } | null
  /** What changed, in words: the new name, the state moved to. */
  detail: string | null
}
