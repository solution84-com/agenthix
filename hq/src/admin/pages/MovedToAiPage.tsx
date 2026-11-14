import { Navigate, useLocation } from 'react-router'
import { AI_PAGE, aiPathFor } from '../aiPage'

/** Providers, Models and the web search page became sections of the AI page: each address opens its section there. */
export function MovedToAiPage() {
  const { pathname, search } = useLocation()
  return <Navigate to={aiPathFor(pathname, search) ?? AI_PAGE} replace />
}

// One page per old address, as Wasp's declarations name each page once.
export const ProvidersMovedPage = MovedToAiPage
export const ModelsMovedPage = MovedToAiPage
export const WebSearchMovedPage = MovedToAiPage
