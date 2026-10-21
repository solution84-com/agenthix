import type { ReactNode } from 'react'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import type { ShownIdentity } from '../../../auth/pages/parts/orgCard'
import { STEP_NAME, countedSteps, type Step } from '../../onboardingFlow'

/** One onboarding screen: the organisation across the top, the step indicator, the form, something useful beside it. */
export function OnboardingFrame({ identity, step, needsModel, aside, children }: {
  identity: ShownIdentity
  step: Step
  needsModel: boolean
  aside?: ReactNode
  children: ReactNode
}) {
  const counted = countedSteps(needsModel)
  const last = step === 'review'
  return (
    <AuthLayout identity={identity} aside={aside}>
      <Steps step={last ? counted.length : counted.indexOf(step) + 1} total={counted.length} name={STEP_NAME[step]} lastLook={last} />
      {children}
    </AuthLayout>
  )
}

export function StepButtons({ onBack, next, nextLabel, busy, onNext }: {
  onBack?: () => void
  /** A submit button inside a form when `onNext` is not given. */
  next?: 'submit'
  nextLabel: string
  busy?: boolean
  onNext?: () => void
}) {
  return (
    <div className="mt-5 flex items-center gap-3">
      {onBack && <button type="button" disabled={busy} onClick={onBack} className={SECONDARY}>Back</button>}
      <button type={next === 'submit' ? 'submit' : 'button'} disabled={busy} onClick={onNext} className={`${PRIMARY} flex-1`}>{nextLabel}</button>
    </div>
  )
}

/** The small heading over what sits beside a form. */
export function AsideLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-small font-medium text-text-muted">{children}</div>
}

export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-xl border border-border px-3.5 py-3">
      <h2 className="mb-2 text-small font-medium text-text-muted">{title}</h2>
      {children}
    </section>
  )
}
