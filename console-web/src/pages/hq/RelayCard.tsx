import type { HqRelay } from '@agenthix/core'
import { StatePill } from '@agenthix/ui/primitives'
import { FactCard, KeyValueRow, Say } from '../../components'
import { Link } from '../../router'
import { helpHref } from '../help/topicIds'
import { OWN_ADDRESS_WORDS, RELAY_NOT_ANSWERING, servesLine, streamsLine, trafficLine } from './relayWords'

/**
 * HQ's relay, the part of HQ that carries file bytes to people's browsers (board R1): its address, the sites it serves,
 * its traffic and the streams open now. Drawn only when HQ has said it has one.
 */
export function RelayCard({ relay }: { relay: HqRelay }) {
  return (
    <FactCard title="HQ's relay" aside={relay.answering ? <StatePill tone="healthy">Running</StatePill> : <StatePill tone="warning">Not answering</StatePill>}>
      <KeyValueRow label="Address">
        {relay.filesAddress
          ? <span className="font-mono text-[.92em]">{relay.filesAddress}</span>
          : <span>{OWN_ADDRESS_WORDS} <Link to={helpHref('domain-and-https')} className="font-medium text-accent hover:underline">Set a files address ›</Link></span>}
      </KeyValueRow>
      <KeyValueRow label="Serves">{servesLine(relay)}</KeyValueRow>
      <KeyValueRow label="Traffic">{trafficLine(relay)}</KeyValueRow>
      <KeyValueRow label="Streams">{streamsLine(relay)}</KeyValueRow>
      {!relay.answering && <Say warn>{RELAY_NOT_ANSWERING.text}</Say>}
    </FactCard>
  )
}
