import { AcrossListPage } from '../screen/AcrossListPage'
import { BoardsAcrossView } from '../screen/BoardsAcrossView'

/** Boards, a rail place: every board the person can see, in every project. */
export function BoardsPage() {
  return (
    <AcrossListPage what="board" title="Boards" subtitle="Every board in your projects: each a way of looking at its project's tasks">
      <BoardsAcrossView />
    </AcrossListPage>
  )
}
