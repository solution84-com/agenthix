import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, getSetupData, getHomeSignals, getAgents } from 'wasp/client/operations'
import { AppShell } from '../../shared/layouts/AppShell'
import { useUsername } from '../../shared/useUsername'
import type { HomeSignals as Counts } from '../../shared/homeTypes'
import { endOfLocalDay, greeting } from '../homeText'
import { KERNEL_HANDLE } from '../../agents/kernelGuards'
import { HomeTiles } from '../components/HomeTiles'
import { HomeNeedsYou, HomeRunning } from '../components/HomeWaiting'
import { HomePinned } from '../components/HomePinned'
import { FirstSuggestions } from '../components/FirstSuggestions'
import { TalkAccessLine } from '../components/TalkAccessLine'
import { PledgeCard } from '../components/PledgeCard'
import { FLOATING_COMPOSER_ROOM, WithFloatingComposer } from '../../conversations/components/FloatingComposer'

// Runs start and end on their sites, not through an action here, so the counts are asked for again now and then.
const SIGNALS_REFETCH_MS = 30_000

/**
 * Home (the board's f5): how HQ is doing — the numbers, what needs the person, what is running, the projects they
 * pinned — and nothing to write in. Writing is the chat's: while it is minimised a floating box sits at Home's foot
 * (`FloatingComposer`), and the page keeps its room whether the box is drawn or not, so nothing moves when the
 * chat's state changes.
 */
export function HomePage() {
  const navigate = useNavigate()
  const username = useUsername()
  const [now, setNow] = useState(() => new Date())
  const until = useMemo(() => endOfLocalDay(now).toISOString(), [now])

  // A page left open past midnight moves on to the new day: its greeting and the end of the day it asks about.
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), new Date(until).getTime() - Date.now() + 1000)
    return () => clearTimeout(timer)
  }, [until])

  const { data: setup } = useQuery(getSetupData)
  const { data: signals } = useQuery(getHomeSignals, { until }, { refetchInterval: SIGNALS_REFETCH_MS })
  const { data: agents } = useQuery(getAgents)
  const builtIn = (agents ?? []).find(a => a.handle === KERNEL_HANDLE) ?? null

  useEffect(() => {
    const o = setup as { isAdmin: boolean; setupComplete: boolean } | undefined
    if (o?.isAdmin && !o.setupComplete) navigate('/setup', { replace: true })
  }, [setup, navigate])

  return (
    <AppShell>
      <WithFloatingComposer>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className={`mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 pt-6 ${FLOATING_COMPOSER_ROOM} lg:pt-8`}>
            <div>
              <h1 className="text-h1 font-semibold text-text-primary">{greeting(now, username)}</h1>
              <p className="mt-1 text-body text-text-secondary">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <TalkAccessLine />
            <HomeTiles counts={signals as Counts | undefined} />
            <FirstSuggestions agent={builtIn} />
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 max-lg:grid-cols-1">
              <div className="flex flex-col gap-3">
                <HomeNeedsYou />
                <HomeRunning />
              </div>
              <div className="flex flex-col gap-3">
                <HomePinned />
              </div>
            </div>
            <PledgeCard />
          </div>
        </div>
      </WithFloatingComposer>
    </AppShell>
  )
}
