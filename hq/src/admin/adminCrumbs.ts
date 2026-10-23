import type { Breadcrumb } from '../shared/layouts/ScreenBar'
import { isAdminPath } from './adminPaths'

/** The first crumb of every page in the admin area. */
export const ADMIN_CRUMB: Breadcrumb = { label: 'Manage organisation', href: '/admin' }

/** The first crumb of a page both frames draw (Teams): the organisation's page for a member, the admin area for an admin. */
export const rootCrumbFor = (pathname: string): Breadcrumb => (isAdminPath(pathname) ? ADMIN_CRUMB : { label: 'Organisation', href: '/org' })
