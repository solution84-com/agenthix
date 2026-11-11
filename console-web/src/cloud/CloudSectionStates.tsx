import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { Notice } from '../components'
import { Link } from '../router'
import { cloudLinkOut } from './linkOut'
import type { CloudSectionView } from './platform'
import { CLOUD } from './words'

/**
 * Words of the Cloud section (board *Cloud section*). One Connect wording for everyone: a person may be new to Cloud
 * or back, so it says they sign in there or make an account, and never which.
 */
export function WhatCloudGives({ named }: { named: string }) {
  return (
    <p className="mt-1 text-small text-text-secondary">
      {CLOUD} is the hosted service from the makers of Agenthix. Connected, {named} gets: sign-in with an Agenthix account and switching
      between organisations for its members; sites on Cloud&apos;s machines; and remote access to this Fleet Console. Nothing on your own machines changes.
    </p>
  )
}

/** Shown only when somebody asked: the count is of people who pressed *Ask a fleet admin to turn it on*. */
export function AskedLine({ count, named }: { count: number | null; named: string }) {
  if (!count) return null
  return (
    <p className="mt-1.5 text-small text-text-secondary">
      <b className="font-semibold text-text-primary">{count} {count === 1 ? 'person' : 'people'}</b> in {named} asked to sign in with {CLOUD}, in HQ&apos;s Settings › Sign-in.
    </p>
  )
}

/** Why hq's calls to Cloud are refused for the protocol's version; its words name the side that must upgrade. */
export function ProtocolProblem({ problem }: { problem: string }): ReactNode {
  return <Notice title="Cloud does not accept this version">{problem}</Notice>
}

/** The connected facts: since when, the person's own Cloud account, and where members link theirs. */
export function ConnectedFacts({ view, named }: { view: CloudSectionView; named: string }): ReactNode {
  return (
    <>
      <p className="mt-1.5 text-small text-text-secondary">
        <b className="font-semibold text-text-primary">Your Cloud account</b>{' '}
        {view.account
          ? `Linked · Cloud's sites show on the Dashboard`
          : <>Not linked — <Link to="/account" className="font-medium text-accent hover:underline">Link a Cloud account</Link> in Your account, to see the sites Cloud runs for {named}</>}
      </p>
      <p className="mt-1 text-small text-text-secondary">Members can link their Agenthix accounts in HQ&apos;s Settings › Sign-in.</p>
    </>
  )
}

/** HQ run by Cloud: the connection is Cloud's own, so there is no Disconnect (board state 6). */
export function RunByCloud({ view, named }: { view: CloudSectionView; named: string }) {
  const href = cloudLinkOut(view.cloudUrl, { task: 'open', from: 'fleet-console-hq' })
  return (
    <>
      <p className="mt-1 text-small text-text-secondary">{CLOUD} runs this HQ for {named}.</p>
      <p className="mt-1.5 text-small text-text-secondary">
        The connection ends only if {named} leaves {CLOUD}, which is done on {CLOUD}.
      </p>
      {href && (
        <Button variant="secondary" className="mt-2" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>Open {CLOUD} ↗</Button>
      )}
    </>
  )
}
