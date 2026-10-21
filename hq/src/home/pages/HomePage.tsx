import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, getSetupData, getHomeSignals, getAgents } from 'wasp/client/operations'
import { AppShell } from '../../shared/layouts/AppShell'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { useUsername } from '../../shared/useUsername'
import type { HomeSignals as Counts } from '../../shared/homeTypes'
import { useChatComposerPlace } from '../../chat/chatComposer'
import { endOfLocalDay, greeting } from '../homeText'
import { KERNEL_HANDLE } from '../../agents/kernelGuards'
import { HomeSignals } from '../components/HomeSignals'
import { FirstSuggestions } from '../components/FirstSuggestions'
import { TalkAccessLine } from '../components/TalkAccessLine'
import { PledgeCard } from '../components/PledgeCard'
import { NewConversationBox } from '../../conversations/components/NewConversationBox'

// Runs start and end on their sites, not through an action here, so the counts are asked for again now and then.
const SIGNALS_REFETCH_MS = 30_000

/**
 * Home (spec §8), personal: can I start talking now — the greeting and the
 * message box, focused, and what a newcomer might say first; is anything waiting
 * on me — one line of signals. Nothing else. On a small screen the message box sits at
 * the bottom, within reach of a thumb.
 */
export function HomePage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const username = useUsername()
  const [now] = useState(() => new Date())
  const [until] = useState(() => endOfLocalDay(now).toISOString())

  const { data: setup } = useQuery(getSetupData)
  const { data: signals } = useQuery(getHomeSignals, { until }, { refetchInterval: SIGNALS_REFETCH_MS })
  const { data: agents } = useQuery(getAgents)
  const builtIn = (agents ?? []).find(a => a.handle === KERNEL_HANDLE) ?? null
  const composer = useChatComposerPlace(null)

  // Typing here starts a conversation in Chat with the person's primary agent.
  const box = (autoFocus: boolean) => (
    <NewConversationBox home="PERSON" basePath="/chat" placeholder={composer.composerPlaceholder} noAgentsNotice={composer.noAgentsNotice} autoFocus={autoFocus} />
  )

  useEffect(() => {
    const o = setup as { isAdmin: boolean; setupComplete: boolean } | undefined
    if (o?.isAdmin && !o.setupComplete) navigate('/setup')
  }, [setup, navigate])

  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-4 pb-6 pt-8 lg:pt-[12vh]">
            <div className="text-center">
              <h1 className="text-display font-semibold text-text-primary">{greeting(now, username)}</h1>
              <p className="mt-1 text-h2 text-text-secondary">What would you like to work on?</p>
            </div>
            {!isMobile && <div className="-mx-4">{box(true)}</div>}
            <TalkAccessLine />
            <HomeSignals counts={signals as Counts | undefined} />
            <FirstSuggestions agent={builtIn} />
            <PledgeCard />
          </div>
        </div>
        {isMobile && (
          <div className="mx-auto w-full max-w-[680px] border-t border-border-subtle">
            {box(false)}
          </div>
        )}
      </div>
    </AppShell>
  )
}
