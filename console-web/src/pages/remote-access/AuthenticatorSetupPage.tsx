/**
 * Setting up the authenticator code (board *Setting up the authenticator code, from the machine*; spec §7): needed
 * only to sign in through remote access, and set up only in a session on the Fleet Console's machine or through an SSH
 * tunnel to it. Ten recovery codes are shown once. The server answers "not connected" until Cloud is.
 */
import { useState, type FormEvent } from 'react'
import { AUTHENTICATOR_CODE, AUTHENTICATOR_RECOVERY_CODE_COUNT, type AuthenticatorView } from '@agenthix/core'
import { Button, COPY_FAILED_WORDS, copyText, FormField, Input } from '@agenthix/ui/primitives'
import { useCloudAsk, useCloudRead } from '../../cloud/api'
import { CloudAskNotice } from '../../cloud/CloudMark'
import { Card, Notice, PageHeading, Say } from '../../components'
import { navigate } from '../../router'

export function AuthenticatorSetupPage() {
  const view = useCloudRead<AuthenticatorView>('/authenticator')
  const start = useCloudAsk()
  const [key, setKey] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const onTheMachine = view.phase === 'ready' && view.value.place === 'onTheMachine'
  const begin = async () => {
    const answer = await start.send<{ key: string }>('POST', '/authenticator')
    if (answer) setKey(answer.key)
  }

  return (
    <div className="max-w-xl">
      <PageHeading
        title="Set up a code for remote sign-in"
      />
      {view.phase === 'failed' && <Notice tone="warning">{view.message}</Notice>}
      {view.phase === 'ready' && !onTheMachine && (
        <Notice tone="neutral" title="Not through remote access">
          Set up your authenticator code on the Fleet Console's machine, or through an SSH tunnel to it. A remote session cannot set up or change it.
        </Notice>
      )}
      {onTheMachine && !key && (
        <Card>
          <p className="text-body text-text-secondary">
            The code is asked for only when you sign in through remote access. Setting it up gives a key for an authenticator app, and{' '}
            {AUTHENTICATOR_RECOVERY_CODE_COUNT} recovery codes shown once.
          </p>
          <Button className="mt-3" disabled={start.ask.phase === 'working'} onClick={() => void begin()}>Set up the code</Button>
          <div className="mt-3"><CloudAskNotice ask={start.ask} /></div>
        </Card>
      )}
      {key && !codes && <ScanStep keyText={key} onDone={setCodes} onNotNow={() => navigate('/account')} />}
      {codes && <RecoveryCodes codes={codes} />}
      <div className="mt-3"><Say lead="A lost phone only stops remote sign-in.">On this machine and over SSH your HQ login still gets you in.</Say></div>
    </div>
  )
}

/** Scanning the key into an app, then the six digits it shows. */
export function ScanStep({ keyText, onDone, onNotNow }: { keyText: string; onDone: (codes: string[]) => void; onNotNow: () => void }) {
  const [code, setCode] = useState('')
  const check = useCloudAsk()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const answer = await check.send<{ recoveryCodes: string[] }>('POST', '/authenticator/check', { code })
    if (answer) onDone(answer.recoveryCodes)
  }
  return (
    <Card>
      <p className="text-body text-text-secondary">Scan this with an authenticator app, then type the six digits it shows.</p>
      <div aria-label="QR code" className="my-3 grid size-36 place-items-center rounded-xl border border-border bg-surface-2 text-micro text-text-muted">QR code</div>
      <p className="text-small text-text-secondary">Can't scan? Type this key into the app: <code className="font-mono text-text-primary">{keyText}</code></p>
      <form onSubmit={submit} className="mt-3">
        <FormField label="Six-digit code from the app" htmlFor="setup-code">
          <Input id="setup-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\s/g, ''))} />
        </FormField>
        <div className="mt-3 flex gap-2">
          <Button type="submit" disabled={!AUTHENTICATOR_CODE.test(code) || check.ask.phase === 'working'}>Check the code</Button>
          <Button type="button" variant="secondary" onClick={onNotNow}>Not now</Button>
        </div>
      </form>
      <div className="mt-3"><CloudAskNotice ask={check.ask} /></div>
    </Card>
  )
}

/** The ten recovery codes, shown once: each signs in once, through remote access, if the phone is lost. */
export function RecoveryCodes({ codes, onStored = () => navigate('/account') }: { codes: string[]; onStored?: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <Card>
      <h2 className="text-h3 font-semibold text-text-primary">Your recovery codes</h2>
      <p className="mt-1 text-small text-text-secondary">
        The code works. Keep these {AUTHENTICATOR_RECOVERY_CODE_COUNT} recovery codes somewhere safe. Each signs you in once, through remote access, if you lose your phone.
      </p>
      <ol aria-label="Recovery codes" className="my-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-border bg-surface-2 px-4 py-3 font-mono text-small text-text-primary">
        {codes.map(c => <li key={c}>{c}</li>)}
      </ol>
      <Notice tone="warning" title="This is the only time they are shown.">They cannot be looked at again.</Notice>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void copyText(codes.join('\n')).then(ok => setCopy(ok ? 'copied' : 'failed'))}>{copy === 'copied' ? 'Copied' : 'Copy'}</Button>
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        <Button onClick={onStored}>I have stored them</Button>
        {copy === 'failed' && <span className="text-micro text-text-muted">{COPY_FAILED_WORDS}</span>}
      </div>
    </Card>
  )
}
