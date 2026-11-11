import type { ReactNode } from 'react'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { backgroundQuery, becauseOf } from '../api/quietRead'
import type { CloudRead } from './api'

/**
 * The meta-line nudge for a Cloud read whose answer is held while a later read failed: "Not up to date · read HH:MM ·
 * Try again" once the answer is over a minute old, else nothing. A read that never answered is said in place of its
 * content by `CloudReadFailure`, not here.
 */
export function useCloudStale(read: CloudRead<unknown> & { reload: () => void }, what: string): ReactNode {
  const held = read.phase === 'ready'
  return useBackgroundRead(
    backgroundQuery({ data: held ? read.value : undefined, error: held ? read.error ?? null : null, readAt: held ? read.readAt ?? null : null, refetch: read.reload }),
    { what, because: becauseOf },
  ).nudge
}
