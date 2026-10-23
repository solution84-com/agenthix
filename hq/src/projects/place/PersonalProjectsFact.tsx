import { Link } from 'react-router'
import { useQuery, getProjects } from 'wasp/client/operations'

/** Your space's overview lists the person's personal projects, each a link to it; none yet points to where one is made. */
export function PersonalProjectsFact() {
  const { data } = useQuery(getProjects)
  if (!data) return <>…</>
  const mine = data.filter(p => p.personalOwnerId && !p.personalSpace).sort((a, b) => a.name.localeCompare(b.name))
  if (mine.length === 0) {
    return <Link to="/projects" className="text-accent hover:underline">None yet — make one ›</Link>
  }
  return (
    <ul className="space-y-0.5">
      {mine.map(p => (
        <li key={p.id}><Link to={`/projects/${p.key}`} className="max-w-full truncate text-accent hover:underline">{p.name}</Link></li>
      ))}
    </ul>
  )
}
