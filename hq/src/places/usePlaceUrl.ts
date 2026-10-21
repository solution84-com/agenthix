import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

const TOOL_PARAM = 'tool'

/**
 * The section a place shows lives in the address (`?tool=tasks`; none for Overview), so a link can open it and Back
 * returns to the section before. Opening a section drops what the section before kept in the address.
 */
export function usePlaceUrl() {
  const [params, setParams] = useSearchParams()
  const tool = params.get(TOOL_PARAM)

  const openTool = useCallback((id: string) => setParams(new URLSearchParams({ [TOOL_PARAM]: id })), [setParams])
  const closeTool = useCallback(() => setParams(new URLSearchParams()), [setParams])

  return { tool, openTool, closeTool }
}
