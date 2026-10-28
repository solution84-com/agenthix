import { createContext, useContext } from 'react'

/** A skill a conversation's work used: the work, and the name its run staged the skill under. */
export type UsedSkillRef = { operationId: string; name: string }

/** Opens a used skill beside the thread; null where there is no thread to open it beside. */
export const UsedSkillOpenerContext = createContext<((ref: UsedSkillRef) => void) | null>(null)

export const useUsedSkillOpener = () => useContext(UsedSkillOpenerContext)
