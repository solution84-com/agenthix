import { Navigate, useParams } from 'react-router'

/** The addresses the rotation notice links to (`/space/secrets`, `/projects/<KEY>/secrets`) open the section. */
export function SecretsAddressPage() {
  const { key } = useParams<{ key: string }>()
  return <Navigate to={key ? `/projects/${key}?tool=secrets` : '/space?tool=secrets'} replace />
}
