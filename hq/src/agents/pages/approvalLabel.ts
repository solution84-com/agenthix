/** Approval as people read it (spec §3, *An agent's permissions*): the stored words are `bypassed`, `deferred` and `immediate`. */
export function approvalLabel(approval: string): string {
  switch (approval) {
    case 'bypassed': return 'Bypassed'
    case 'deferred': return 'Deferred'
    case 'immediate': return 'Immediate'
    default: return approval
  }
}
