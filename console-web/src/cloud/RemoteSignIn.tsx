import { useState } from 'react'
import { AUTHENTICATOR_CODE, BRANDING, RECOVERY_CODE } from '@agenthix/core'
import { FormField, Input } from '@agenthix/ui/primitives'
import { useCloudRead } from './api'

/** Whether the sign-in page was opened through remote access, so it asks for a code too. False with the flag off. */
export function useRemoteSignIn(): boolean {
  const read = useCloudRead<{ remote: boolean }>('/sign-in/remote')
  return read.phase === 'ready' && read.value.remote
}

/** What a remote sign-in sends besides the HQ login: the app's six digits, or one recovery code. */
export type SecondStep = { code: string } | { recoveryCode: string }

export function secondStepReady(step: SecondStep): boolean {
  return 'code' in step ? AUTHENTICATOR_CODE.test(step.code) : RECOVERY_CODE.test(step.recoveryCode.trim().toLowerCase())
}

/** The code fields of a remote sign-in (board *Through remote access: hq login plus code*). */
export function RemoteCodeFields({ step, onChange, machineName, username }: {
  step: SecondStep
  onChange: (step: SecondStep) => void
  machineName: string
  username: string
}) {
  const [recovery, setRecovery] = useState('recoveryCode' in step)
  const toggle = () => {
    setRecovery(!recovery)
    onChange(recovery ? { code: '' } : { recoveryCode: '' })
  }
  return (
    <>
      {'code' in step ? (
        <FormField label="Six-digit code from your authenticator app" htmlFor="sign-in-code">
          <Input id="sign-in-code" name="code" inputMode="numeric" autoComplete="one-time-code" value={step.code}
            onChange={e => onChange({ code: e.target.value.replace(/\s/g, '') })} />
        </FormField>
      ) : (
        <FormField label="Recovery code" htmlFor="sign-in-recovery">
          <Input id="sign-in-recovery" name="recoveryCode" autoComplete="off" value={step.recoveryCode}
            onChange={e => onChange({ recoveryCode: e.target.value })} />
        </FormField>
      )}
      <p className="text-micro text-text-muted">
        {recovery ? 'Have your phone? ' : 'No phone? '}
        <button type="button" className="font-semibold text-text-secondary underline" onClick={toggle}>
          {recovery ? 'Use the code from your app' : 'Use a recovery code'}
        </button>
        {recovery ? ' instead.' : ' instead. Each works once.'}
      </p>
      <p className="mt-3 text-micro text-text-muted">
        <b className="font-semibold text-text-secondary">A lost phone only stops remote sign-in.</b> At {machineName}, or over SSH, your HQ
        login alone still works. Lost the code for good? The machine admin of the Fleet Console's machine runs{' '}
        <code className="font-mono">{`${BRANDING.cliCommand} console reset-code ${username || '<username>'}`}</code>.
      </p>
    </>
  )
}
