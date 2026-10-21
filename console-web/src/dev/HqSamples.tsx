import { useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { FactGroup, SectionHeading } from '../components'
import { EraseModal } from '../pages/hq/EraseModal'
import { DependsCard, HqSiteLine, ReachCard } from '../pages/hq/HqCards'
import { BackupsCard, VersionCard } from '../pages/site/SiteCards'
import { SAMPLE_HOSTS, SAMPLE_HQ } from './fleetSamples'

const hq = SAMPLE_HOSTS[0]
const withDoor = (door: NonNullable<typeof hq.figures>['frontDoor']) => ({ ...hq, figures: hq.figures && { ...hq.figures, frontDoor: door } })
const soon = new Date(Date.now() + 9 * 86400_000).toISOString()

/** HQ's page: its cards, the front door line in each state, and the erase dialog. */
export function HqSamples() {
  const [dialog, setDialog] = useState<'erase' | 'refused' | null>(null)
  const now = new Date()
  return (
    <>
      <SectionHeading>HQ's page: the HQ group, the front door in each state, the erase dialog</SectionHeading>
      <FactGroup tag="HQ" aside="what people sign in to">
        <ReachCard host={hq} address={SAMPLE_HQ.address} now={now} />
        <ReachCard host={withDoor({ on: true, certificateExpiresAt: soon, renewalProblem: null })} address={SAMPLE_HQ.address} now={now} />
        <ReachCard host={withDoor({ on: true, certificateExpiresAt: soon, renewalProblem: 'Renewing the certificate for its uploaded files failed twice: its DNS does not point at hq-box. Point it here, then try again.' })} address={SAMPLE_HQ.address} now={now} />
        <DependsCard hosts={SAMPLE_HOSTS} />
        <VersionCard host={hq} target="hq" now={now} />
        <BackupsCard host={hq} now={now} backupsTo="/hq/backups" next />
        <HqSiteLine host={hq} />
      </FactGroup>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={() => setDialog('erase')}>Erase HQ?</Button>
        <Button variant="danger" onClick={() => setDialog('refused')}>Erase HQ, refused</Button>
      </div>
      <EraseModal open={dialog === 'erase' || dialog === 'refused'} machineName="hq-box" address={SAMPLE_HQ.address} locationSet
        run={{ action: 'erase', run: dialog === 'refused' ? { phase: 'refused', message: "Not erased: that is not HQ's address (it is https://hq.acme.example). Nothing changed." } : { phase: 'idle' } }}
        onErase={() => setDialog(null)} onClose={() => setDialog(null)} />
    </>
  )
}
