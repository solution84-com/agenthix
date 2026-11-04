/** The projects a connection can be limited to: only those the person is a member of (the server refuses the rest). */
export function connectionProjectOptions(projects: readonly { id: string; name: string; isMember: boolean }[] | undefined) {
  return (projects ?? []).filter((p) => p.isMember).map((p) => ({ id: p.id, name: p.name }))
}
