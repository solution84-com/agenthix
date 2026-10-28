import { Navigate } from 'react-router'

/** The former Skills page: the Library, narrowed to skills (skills spec part 6). */
export function SkillsRedirectPage() {
  return <Navigate to="/library?type=skill" replace />
}
