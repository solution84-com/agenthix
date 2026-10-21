import { useEffect, useRef, type RefObject } from 'react'

/** How long the panel gathers what came into view before it tells the server, in one call. */
const BATCH_MS = 600

/** Whether most of an item lies inside the list's visible box. */
function shownIn(box: DOMRect, item: DOMRect): boolean {
  if (item.height <= 0) return false
  const visible = Math.min(item.bottom, box.bottom) - Math.max(item.top, box.top)
  return visible >= item.height * 0.6
}

/**
 * Marks a notification seen once it has been in view in the open panel: each
 * item carries `data-item-id`, and the unread ones are watched inside `root`
 * (the panel's scrolling list). What comes into view is sent in batches.
 */
export function useMarkSeen(root: RefObject<HTMLElement | null>, unreadIds: string[], markSeen: (ids: string[]) => unknown) {
  const sent = useRef(new Set<string>())
  const pending = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markRef = useRef(markSeen)
  markRef.current = markSeen
  const key = unreadIds.join(',')

  useEffect(() => {
    const container = root.current
    if (!container || unreadIds.length === 0) return
    const flush = () => {
      timer.current = null
      const ids = [...pending.current]
      pending.current.clear()
      if (ids.length) void markRef.current(ids)
    }
    const see = (id: string | undefined) => {
      if (!id || sent.current.has(id)) return false
      sent.current.add(id)
      pending.current.add(id)
      return true
    }
    const schedule = () => { if (pending.current.size && !timer.current) timer.current = setTimeout(flush, BATCH_MS) }
    const wanted = new Set(unreadIds)
    const items = [...container.querySelectorAll<HTMLElement>('[data-item-id]')].filter(el => wanted.has(el.dataset.itemId ?? ''))

    // What is already in view when the panel opens, or the list changes, is seen without any scrolling.
    const box = container.getBoundingClientRect()
    for (const el of items) if (shownIn(box, el.getBoundingClientRect())) see(el.dataset.itemId)
    schedule()

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && see((entry.target as HTMLElement).dataset.itemId)) observer?.unobserve(entry.target)
      }
      schedule()
    }, { root: container, threshold: 0.6 })
    for (const el of items) if (!sent.current.has(el.dataset.itemId ?? '')) observer?.observe(el)
    return () => {
      observer?.disconnect()
      if (timer.current) { clearTimeout(timer.current); flush() }
    }
    // The ids, not the array: a refetch with the same unread items needs no new observer.
  }, [root, key])
}
