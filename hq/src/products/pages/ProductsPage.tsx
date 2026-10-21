import { GroupsScreen } from '../components/GroupsScreen'

/** Products (every screen reviewed spec §3, Organisation): the list; the one opened is `ProductDetailPage`. */
export function ProductsPage() {
  return <GroupsScreen kind="product" />
}
