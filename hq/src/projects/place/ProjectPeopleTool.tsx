import { PersonScreen } from './people/PersonScreen'
import { AddPeopleScreen } from './people/AddPeopleScreen'
import { RemoveScreen } from './people/RemoveScreen'
import { usePeopleToolUrl } from './people/usePeopleToolUrl'

/**
 * A person inside a project's Members (every screen reviewed spec §3, People): what waits on them, their role, and Add,
 * Remove and Leave in place. The list of members is `members/MembersListScreen`. Kept apart from an agent's screens:
 * members decide entitlement, an agent's assignment grants it nothing (adr-0099).
 */
export function ProjectPeopleTool({ projectId, backLabel }: { projectId: string; personal?: boolean; backLabel?: string }) {
  const url = usePeopleToolUrl()
  const { screen } = url
  switch (screen.kind) {
    case 'add':
      return <AddPeopleScreen projectId={projectId} onBack={url.toList} backLabel={backLabel} />
    case 'person':
      return (
        <PersonScreen
          key={screen.userId} projectId={projectId} userId={screen.userId} backLabel={backLabel}
          onBack={url.toList} onRemove={() => url.toRemove(screen.userId)} onLeave={() => url.toLeave(screen.userId)}
        />
      )
    case 'remove':
    case 'leave':
      return (
        <RemoveScreen
          key={`${screen.kind}-${screen.userId}`} projectId={projectId} userId={screen.userId} mode={screen.kind}
          onCancel={() => url.toPerson(screen.userId)} onDone={url.toList} backLabel={backLabel}
        />
      )
    default:
      return null
  }
}
