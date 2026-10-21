import { Link } from '../router'
import { helpHref, type TopicId } from '../pages/help/topicIds'

/**
 * A small "How this works ›" link from a section to the Help topic that explains it (board *Proposal*, 9). Put it
 * beside the section's heading. The topics, by `topic`:
 *
 * - `hq-sites-and-fleet-admins`: what HQ, a site and a fleet admin are; a site is named after its machine
 * - `add-a-site`: adding a site, moving one to a new machine, removing one (disconnect, erase, suspend), how many runs at once
 * - `backups-and-restoring`: the nightly backup, the backup location, exporting, restoring a lost site or HQ
 * - `domain-and-https`: HQ's address and front door, changing the address, live previews
 * - `back-up-and-upgrade`: maintenance — Plan maintenance, upgrades now or later, what members see, automatic fixes, suspend, moving HQ
 * - `recover-admin`: when nobody can sign in, and getting the fleet admin role back with `agenthix hq fleet-admin`
 * - `commands`: every `agenthix` command on a machine
 *
 * `section` is a heading's id on that page, in GitHub's form (`what-a-servers-address-needs`), to open it there.
 */
export function HowThisWorks({ topic, section, className = '' }: { topic: TopicId; section?: string; className?: string }) {
  return (
    <Link to={helpHref(topic, section)} className={`inline-flex items-center gap-0.5 text-small font-medium text-text-secondary hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}>
      How this works <span aria-hidden="true">›</span>
    </Link>
  )
}
