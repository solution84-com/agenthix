/** Where Settings › Task types' own pages are. */
const base = (projectKey: string) => `/projects/${encodeURIComponent(projectKey)}/settings/types`

export const newTaskTypePath = (projectKey: string) => `${base(projectKey)}/new`
export const publishTemplatePath = (projectKey: string) => `${base(projectKey)}/publish`
export const taskTypePath = (projectKey: string, typeId: string) => `${base(projectKey)}/${encodeURIComponent(typeId)}`
