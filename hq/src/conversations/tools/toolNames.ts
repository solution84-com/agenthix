/**
 * The names of the tools whose modules reach the database, kept apart so the tool search can name them without
 * importing those modules: foldedTools.ts is imported by the turn, and importing them from it closed an import cycle
 * that left a tool undefined in the registry.
 */
export const ANSWER_APPROVAL = 'answer_approval'
export const CANCEL_OPERATION = 'cancel_operation'
export const OFFER_LIVE_PREVIEW_TOOL = 'offer_live_preview'
