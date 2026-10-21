import { useState } from 'react'
import { BRANDING } from '@agenthix/core'
import { Button, Modal } from '@agenthix/ui/primitives'
import { CloudOfferLine } from '../../cloud/CloudOfferLine'
import { Notice, PageHeading, SectionHeading } from '../../components'
import { useSessionDetails } from '../../auth/useSessionDetails'
import { navigate } from '../../router'
import { HQ_PATH } from '../../shell/menu'
import { useHost } from '../site/useHost'
import { commandWords, hostOf, HQ_LISTENS_ON, uploadedFiles } from './hqWords'
import { useHostCommand } from './useHostCommand'
import { maintenanceAddress } from '../maintenance/panelAddress'
import { HQ_KEY } from '../maintenance/things'

type Door = 'own' | 'service'

/** An address that is not https, or is a network address rather than a name: HQ cannot have HTTPS on it. */
export function bareAddress(address: string | null): boolean {
  if (!address) return false
  if (!address.startsWith('https://')) return true
  return /^https:\/\/(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]|localhost)(:|\/|$)/i.test(address)
}

/**
 * HQ's address and the front door (board *hq's address and the front door*, spec §6, §11, §16). Changing the address is a
 * move, so *Change…* opens *Plan maintenance* with *Move* chosen; the host service's own front door is turned on only after a warning whose
 * default is No, and the host service refuses it while either port is in use.
 */
export function AddressPage({ fingerprint, pollMs }: { fingerprint: string; pollMs?: number }) {
  const state = useHost(fingerprint)
  const host = state.phase === 'loading' ? null : state.host
  const address = useSessionDetails()?.hq?.address ?? null
  const command = useHostCommand(fingerprint, pollMs)
  const [choice, setChoice] = useState<Door | null>(null)
  const [warning, setWarning] = useState(false)
  const [action, setAction] = useState<'frontDoor' | 'frontDoorOff' | null>(null)

  if (state.phase === 'failed' && !host) return (<><PageHeading title="Address and front door" /><Notice tone="danger">{state.message}</Notice></>)
  if (!host) return null
  if (!host.hqMachine) {
    return (<><PageHeading title="Address and front door" /><Notice>Only HQ's machine has HQ's address and a front door. {host.machineName} carries a site.</Notice></>)
  }

  const current: Door = host.figures?.frontDoor.on ? 'service' : 'own'
  const selected = choice ?? current
  const machine = host.machineName
  const hosts = address ? `${hostOf(address)} and its uploaded files' host` : "HQ's address and its uploaded files' host"
  const turnOn = () => {
    setWarning(false)
    setAction('frontDoor')
    command.send({ op: 'frontDoor.set', on: true, confirmPorts: true })
  }
  const save = () => {
    if (selected === current) return
    if (selected === 'service') return setWarning(true)
    setAction('frontDoorOff')
    command.send({ op: 'frontDoor.set', on: false })
  }
  const keepOwn = () => {
    setChoice('own')
    setAction(null)
    command.reset()
  }
  const said = action ? commandWords(action, command.run) : null
  const refusedOn = action === 'frontDoor' && command.run.phase === 'refused'

  const option = (value: Door, title: string, text: React.ReactNode) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
      <input type="radio" name="front-door" className="mt-1" checked={selected === value} onChange={() => setChoice(value)} />
      <span><b className="font-semibold text-text-primary">{title}</b> <span className="text-small text-text-secondary">{text}</span></span>
    </label>
  )

  return (
    <>
      <PageHeading title="Address and front door"
        lede="Where people and sites reach HQ. Changing HQ's address is a move: HQ is read-only while sites and host services follow." />
      <div className="max-w-2xl">
        <SectionHeading>HQ's address</SectionHeading>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span className="flex-1 font-mono text-body text-text-primary">{address ?? 'HQ has not said its address yet.'}</span>
          <Button variant="secondary" onClick={() => navigate(maintenanceAddress(HQ_PATH, HQ_KEY, 'move'))}>Change…</Button>
        </div>
        <p className="mt-1.5 text-small text-text-secondary">
          Connected sites and host services are told the new address and switch once it passes their check; an offline site
          needs <code className="font-mono">{BRANDING.cliCommand} site hq-address</code> on its machine, an offline
          machine <code className="font-mono">{BRANDING.cliCommand} console hq-address</code>.
        </p>

        {address && (
          <>
            <SectionHeading>Uploaded files</SectionHeading>
            <p className="text-small text-text-primary">{uploadedFiles(address)}</p>
          </>
        )}

        <SectionHeading>Front door — what carries web traffic to HQ</SectionHeading>
        <div className="flex flex-col gap-2">
          {option('own', 'Your own web server', <>HQ listens on <code className="font-mono">{HQ_LISTENS_ON}</code>. Point nginx, Caddy or your tunnel at it, passing WebSocket upgrades.</>)}
          {option('service', "The host service's front door", `It takes ports 80 and 443 on ${machine} and gets the certificates for ${hosts} itself.`)}
        </div>
        {bareAddress(address) && <CloudOfferLine offer="address" from="fleet-console-address" />}
        <div className="mt-3">
          {refusedOn ? (
            <Notice tone="danger" title={said!.title} action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={turnOn}>Try again</Button>
                <Button variant="secondary" onClick={keepOwn}>Keep my own web server</Button>
              </div>
            }>{said!.text}</Notice>
          ) : said && said.text !== '' ? <Notice tone={said.tone} title={said.title}>{said.text}</Notice>
            : said ? <Notice tone={said.tone}>{said.title}</Notice> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" disabled={selected === current || command.run.phase === 'working'} onClick={save}>Save</Button>
          <Button variant="secondary" onClick={() => navigate(HQ_PATH)}>Cancel</Button>
        </div>
      </div>

      <Modal open={warning} onClose={() => setWarning(false)} title={`Take ports 80 and 443 on ${machine}?`}>
        <div className="flex flex-col gap-3 text-body text-text-primary">
          <p>This becomes the front door for the whole machine. The host service takes ports 80 and 443, and nothing else on {machine} can serve web traffic on them. Any other web application here would have to go through it.</p>
          <p>If {machine} already has a web server — nginx, Caddy, Traefik, a tunnel — keep it and point it at <code className="font-mono">{HQ_LISTENS_ON}</code> instead.</p>
          <p className="text-small text-text-secondary">It needs {hosts} pointing at {machine}, and ports 80 and 443 reachable from the internet.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="primary" type="button" autoFocus onClick={() => { setWarning(false); setChoice('own') }}>No, keep my own web server</Button>
          <Button variant="secondary" type="button" onClick={turnOn}>Yes, take ports 80 and 443</Button>
        </div>
      </Modal>
    </>
  )
}
