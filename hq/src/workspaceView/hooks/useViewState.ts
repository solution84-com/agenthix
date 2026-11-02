import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
  MAIN, addressNamesAPlace, readRemembered, readViewAddress, remember, viewAddressOf,
  type ViewSection, type ViewState,
} from '../viewAddress'

/**
 * Where the person is in the view, held in the address (spec part 1, *Switching*). Arriving by an address that names
 * no place, the place last seen in this workspace is put back; every move is remembered for next time. Moves replace
 * the address, so Back leaves the view rather than stepping through files.
 */
export function useViewState(workspaceId: string, userId: string | null, defaultSection: ViewSection) {
  const [params, setParams] = useSearchParams()
  const named = addressNamesAPlace(params)
  const state = useMemo<ViewState>(() => {
    const fromAddress = readViewAddress(params)
    const base = named || !userId ? fromAddress : readRemembered(window.localStorage, userId, workspaceId)
    return { branch: base.branch ?? MAIN, section: base.section ?? defaultSection, file: base.file ?? null, diff: base.diff ?? null }
  }, [params, named, userId, workspaceId, defaultSection])

  const set = useCallback((next: Partial<ViewState>) => {
    setParams(new URLSearchParams(viewAddressOf({ ...state, ...next })), { replace: true })
  }, [state, setParams])

  useEffect(() => {
    if (userId) remember(window.localStorage, userId, workspaceId, state)
  }, [userId, workspaceId, state])

  return { state, set }
}
