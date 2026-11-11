import { Link } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, getUserSettings, getPersonCard } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { orgRoleLabel } from '@agenthix/ui/people'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { PersonNameAndPicture } from '../../org/pages/people/PersonNameAndPicture'
import { PrimaryAgentSection } from '../../conversations/components/PrimaryAgentSection'
import { ClaudeSubscriptionSection } from '../../model-access/pages/ClaudeSubscriptionSection'
import { OwnList } from '../../models-settings/components/OwnList'
import { AppearanceSection } from './AppearanceSection'
import { TimezoneSection } from './TimezoneSection'
import { BusyConversationSection } from './BusyConversationSection'
import { AdaptiveVoiceSection } from './AdaptiveVoiceSection'
import { VoiceSoundsSection } from './VoiceSoundsSection'
import { SignInSection } from './SignInSection'
import { SettingsRow, SettingsSection } from './SettingsSection'
import { BRANDING } from '@agenthix/core'

const since = (at: string | Date) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const rowLink = `rounded font-medium text-link hover:underline ${FOCUS_RING}`

/**
 * Settings is only the signed-in person's own (spec §3): one page of sections.
 * The organisation's settings are Organisation › Settings, and what hq runs on
 * is Organisation › Infrastructure; nothing here is for admins.
 */
export function SettingsPage() {
  const { data: user } = useAuth()
  const { data: settings } = useQuery(getUserSettings)
  const cardQuery = useQuery(getPersonCard, { userId: user?.id ?? '' }, { enabled: !!user?.id })
  const { data: card } = cardQuery
  const cardRead = useBackgroundRead(cardQuery, { what: 'Your name and picture' })
  const handle = card?.person.handle

  return (
    <AppLayout breadcrumbs={[{ label: 'Settings' }]}>
      <div className="px-4 lg:px-10 py-9 max-w-[760px]">
        <header className="mb-8">
          {card ? <PersonNameAndPicture person={card.person} canEdit /> : cardRead.failedWithoutData ? cardRead.nudge : <p className="text-text-muted">Loading…</p>}
          {settings && (
            <p className="mt-2 text-small text-text-muted">
              {orgRoleLabel(settings.role ?? null)} · in {BRANDING.displayName} since {since(settings.createdAt)}
            </p>
          )}
        </header>

        <SettingsSection title="Profile" description="Others see your name and picture on your work.">
          <SettingsRow label="Handle">{handle ? `@${handle} · your sign-in name` : '—'}</SettingsRow>
          <div className="mt-3"><TimezoneSection /></div>
        </SettingsSection>

        <SettingsSection title="Appearance" description="Remembered in this browser.">
          <AppearanceSection />
        </SettingsSection>

        <SettingsSection title="Conversations" description="What happens when you send a message while an agent is still answering.">
          <BusyConversationSection />
        </SettingsSection>

        <SettingsSection title="Voice" description="How a voice conversation sounds.">
          <div className="space-y-5">
            <AdaptiveVoiceSection />
            <VoiceSoundsSection />
          </div>
        </SettingsSection>

        <SettingsSection title="Primary agent" description="The agent a new conversation starts with. You can pick another before you send the first message.">
          <PrimaryAgentSection />
        </SettingsSection>

        {user?.id && (
          <SettingsSection title="Your Claude subscription" description="Your own Claude login, for work in your space and your personal projects.">
            <ClaudeSubscriptionSection />
          </SettingsSection>
        )}

        {user?.id && (
          <SettingsSection title="Which models may run for you" description="Narrows the organisation's list, everywhere you work.">
            <OwnList owner="person" ownerId={user.id} intro={orgName => `Only narrows ${orgName}'s list for you; it never widens it.`} />
          </SettingsSection>
        )}

        <SettingsSection title="Memory">
          <SettingsRow label="Memory" action={<Link to="/settings/memory" className={rowLink}>Manage</Link>}>
            What agents remember about you, and what they remember where you work
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Devices and connections">
          <SettingsRow label="Phone" action={<Link to="/settings/mobile" className={rowLink}>Show code</Link>}>
            Connect a phone
          </SettingsRow>
          <SettingsRow label="Connections" action={<Link to="/settings/connections" className={rowLink}>Manage</Link>}>
            Tools that act for you, such as your own Claude Code
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Sign-in">
          <SignInSection />
        </SettingsSection>
      </div>
    </AppLayout>
  )
}
