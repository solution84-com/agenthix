import { useMemo } from 'react'
import { useQuery, getPlaceSecrets, getPlaceVariables } from 'wasp/client/operations'
import type { PlaceTool } from '../../places/placeTypes'
import { SECRETS_REFRESH_MS, SecretsTool } from './SecretsTool'
import type { SecretsPlace } from './secretsTypes'

/**
 * The Secrets and variables entry of a place's panel (secrets spec part 5, U1), beside Members and Settings: the number
 * of secrets and variables, or *N overdue* / *N to rotate* in the needs tone, for the administrators only. Undefined
 * while there is no place.
 */
export function useSecretsTool(place: SecretsPlace | undefined): PlaceTool | undefined {
  const opts = { enabled: !!place, refetchInterval: SECRETS_REFRESH_MS }
  const { data: secrets } = useQuery(getPlaceSecrets, place ? { place } : undefined, opts)
  const { data: variables } = useQuery(getPlaceVariables, place ? { place } : undefined, opts)
  const overdue = secrets?.mayChange ? secrets.secrets.filter((s) => s.rotation === 'overdue').length : 0
  const soon = secrets?.mayChange ? secrets.secrets.filter((s) => s.rotation === 'due_soon').length : 0
  const total = secrets && variables ? secrets.secrets.length + variables.variables.length : undefined
  const type = place?.type
  const id = place?.id
  return useMemo(() => {
    if (!type || !id) return undefined
    const here: SecretsPlace = { type, id }
    return {
      id: 'secrets',
      label: 'Secrets and variables',
      count: overdue > 0 ? `${overdue} overdue` : soon > 0 ? `${soon} to rotate` : total === undefined ? undefined : String(total),
      tone: overdue + soon > 0 ? 'needs' as const : undefined,
      render: () => <SecretsTool place={here} />,
    }
  }, [type, id, overdue, soon, total])
}
