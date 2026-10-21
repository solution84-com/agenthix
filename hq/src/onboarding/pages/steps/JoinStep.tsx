import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { AccountFields, type AccountForm } from '../../../auth/pages/parts/AccountFields'
import { Heading, Steps, TEXT_LINK } from '../../../auth/pages/parts/authUi'
import { InviteSummary } from '../../../auth/pages/parts/InviteSummary'
import type { InviteView } from '../../../auth/pages/parts/linkApi'
import { Link } from 'react-router'
import { CloudSignInOption } from '../../../auth/pages/parts/CloudSignInOption'
import { JoinAside } from './JoinAside'
import { countedSteps } from '../../onboardingFlow'

/** Onboarding's first step, on the invitation link: who invited them, then the account — name, username, password. */
export function JoinStep({ view, busy, error, onSubmit }: { view: InviteView; busy: boolean; error: string; onSubmit: (form: AccountForm) => void }) {
  const org = view.org.name ?? 'the organisation'
  return (
    <AuthLayout identity={view.org} aside={<JoinAside view={view} />}>
      <Steps step={1} total={countedSteps(view.needsModel).length} name="Join" />
      <Heading title={`Join ${org}`} />
      <InviteSummary view={view} />
      <AccountFields submitLabel={`Join ${org}`} busyLabel="Creating your account…" busy={busy} error={error} onSubmit={onSubmit} />
      <CloudSignInOption org={view.org.name} place="invite" />
      <p className="mt-3 text-center text-small text-text-muted">Already have an account here? <Link to="/login" className={TEXT_LINK}>Sign in</Link></p>
    </AuthLayout>
  )
}
