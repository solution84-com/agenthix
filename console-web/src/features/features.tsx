/**
 * Which flagged features are on (adr-0172), read once from the Fleet Console's server (`GET /api/features`, which asks
 * hq) for every screen under it. A flagged section is drawn only while `useFeature` says so: a convenience only, since
 * the server refuses the section's routes itself. Nothing is on until the answer comes, or when it does not.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { FeatureFlag } from '@agenthix/core'
import { api } from '../api/client'

const FeaturesOn = createContext<ReadonlySet<string>>(new Set())

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    let live = true
    api<{ on?: unknown }>('/features')
      .then(answer => { if (live && Array.isArray(answer.on)) setOn(new Set(answer.on.filter((f): f is string => typeof f === 'string'))) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return <FeaturesOn.Provider value={on}>{children}</FeaturesOn.Provider>
}

export function useFeature(flag: FeatureFlag): boolean {
  return useContext(FeaturesOn).has(flag)
}
