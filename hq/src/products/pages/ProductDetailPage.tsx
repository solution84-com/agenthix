import { useParams } from 'react-router'
import { GroupsScreen } from '../components/GroupsScreen'

/** A product opened beside the list of products: its projects as the Projects screen's cards. */
export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  return <GroupsScreen kind="product" slug={slug} />
}
