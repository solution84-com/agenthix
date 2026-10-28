/**
 * Whether the picker offers the built-in given only where a run works in a repository (`working-with-git`; adr-0156),
 * from hq's records alone: the picker asks no site. Yes when the conversation's work has run in a workspace (a
 * session of this conversation with a primary workspace), or the place's last scan found skills in a workspace's
 * repository. A hint, not the gate: a run stages the built-in only when its site finds a repository, and the site
 * drops a pick of a skill it did not stage.
 */
import type { Db } from '../../packages/packageStore'
import type { RepositoryCheck } from '../../assets/builtins/delivery'
import type { Place } from '../../assets/places/scan'

export function recordedRepository(db: Db, at: { conversationId: string | null; place: Place | null }): RepositoryCheck {
  return async () => {
    if (at.conversationId) {
      const worked = await db.agentSession.findFirst({
        where: { conversationId: at.conversationId, primaryWorkspaceId: { not: null } }, select: { id: true },
      })
      if (worked) return true
    }
    if (!at.place) return false
    const found = await db.placeSkill.findFirst({ where: { ...at.place, group: 'WORKSPACE', goneAt: null }, select: { id: true } })
    return found !== null
  }
}
