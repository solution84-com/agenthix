/**
 * The ledger's work in the background: a subscription run's row when the run ends, and a sweep that writes the relay's
 * usage reports not yet on the ledger (those that arrived before their run's costing, or whose writing failed).
 */
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { Logger } from '../server/utils/logger'
import { ledgerRelayReports } from './sources/relay'
import { ledgerSubscriptionRun } from './sources/runs'

const logger = new Logger('Ledger')
const SWEEP_MS = 60_000

export function startLedger(): void {
  onRunStatus('ledger-subscription-run', ledgerSubscriptionRun)
  const sweep = () => {
    void ledgerRelayReports().catch(err => logger.warn(`Usage reports not written to the ledger: ${err instanceof Error ? err.message : String(err)}`))
  }
  sweep()
  setInterval(sweep, SWEEP_MS).unref()
}
