import { Navigate } from 'react-router'

/** The former Skills page: skills are the Library's Skills tab (every screen reviewed spec §3). */
export function SkillsRedirectPage() {
  return <Navigate to="/library?tab=skills" replace />
}
