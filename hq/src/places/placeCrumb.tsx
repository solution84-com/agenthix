import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'

/** What a view opened inside a place's section adds to the screen's frame. */
export interface PlaceDrill {
  /** The last part of the breadcrumb, after the section (a task's key); the section becomes the way back to its list. */
  crumb: string | null
  /** An add button in the phone's top bar, named by its label (the view's own on a wide screen). */
  add: { label: string; onClick: () => void } | null
}

export interface PlaceDrillSlot {
  setCrumb: (crumb: string | null) => void
  setAdd: (add: PlaceDrill['add']) => void
}

export const PlaceDrillContext = createContext<PlaceDrillSlot | null>(null)

/** Held by a place's screen: what the view inside its section has published, and the slot it publishes through. */
export function usePlaceDrillState(): { drill: PlaceDrill; slot: PlaceDrillSlot } {
  const [crumb, setCrumb] = useState<string | null>(null)
  const [add, setAdd] = useState<PlaceDrill['add']>(null)
  const slot = useMemo<PlaceDrillSlot>(() => ({ setCrumb, setAdd }), [])
  return { drill: { crumb, add }, slot }
}

/** Puts `crumb` at the end of the place's breadcrumb while the view is shown. False where no place frames the view. */
export function usePlaceCrumb(crumb: string | null): boolean {
  const slot = useContext(PlaceDrillContext)
  useLayoutEffect(() => {
    if (!slot || !crumb) return
    slot.setCrumb(crumb)
    return () => slot.setCrumb(null)
  }, [slot, crumb])
  return !!slot
}

/** Puts an add button in the phone's top bar while the view is shown. False where no place frames the view. */
export function usePlaceTopBarAdd(add: PlaceDrill['add']): boolean {
  const slot = useContext(PlaceDrillContext)
  const latest = useRef(add?.onClick)
  latest.current = add?.onClick
  const label = add?.label ?? null
  useLayoutEffect(() => {
    if (!slot || !label) return
    slot.setAdd({ label, onClick: () => latest.current?.() })
    return () => slot.setAdd(null)
  }, [slot, label])
  return !!slot
}
