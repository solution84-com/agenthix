import { useParams } from 'react-router'
import { GroupsScreen } from '../components/GroupsScreen'

/** A programme opened beside the list of programmes: its goal, and its projects as the Projects screen's cards. */
export function ProgramDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  return <GroupsScreen kind="program" slug={slug} />
}
