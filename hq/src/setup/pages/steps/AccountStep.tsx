import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { AccountFields, type AccountForm } from '../../../auth/pages/parts/AccountFields'
import { FreshHqSide } from '../../../auth/pages/parts/BrandSide'
import { CloudSignInOption } from '../../../auth/pages/parts/CloudSignInOption'
import { Heading, Steps } from '../../../auth/pages/parts/authUi'
import { BRANDING } from '@agenthix/core'

/** Setup's first step on the first-admin link: the account the first person here makes, and so the organisation's admin. */
export function AccountStep({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (form: AccountForm) => void }) {
  return (
    <AuthLayout setup side={<FreshHqSide />}>
      <Steps step={1} />
      <Heading title={`Set up ${BRANDING.displayName} for your organisation`} lead="You're the first person here, so you'll be its admin." />
      <AccountFields submitLabel="Continue" busyLabel="Creating your account…" busy={busy} error={error} onSubmit={onSubmit} />
      <CloudSignInOption org={null} place="setup" />
    </AuthLayout>
  )
}
