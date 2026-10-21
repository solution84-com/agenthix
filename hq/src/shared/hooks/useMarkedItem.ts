import { useSearchParams } from 'react-router'

const MARK = 'ring-2 ring-accent'

/**
 * The item a *Show in …* link names, read from the address (`?tool=memory&memory=<key>`): the tool marks it and
 * scrolls it into view. `markOf(id)` gives the props to spread on that item's row; the others get none.
 */
export function useMarkedItem(param: string) {
  const [params] = useSearchParams()
  const marked = params.get(param)
  return {
    marked,
    markOf: (id: string) => (marked !== null && marked === id
      ? { 'data-marked': 'true' as const, className: MARK, ref: (el: HTMLElement | null) => { el?.scrollIntoView?.({ block: 'center' }) } }
      : {}),
  }
}
