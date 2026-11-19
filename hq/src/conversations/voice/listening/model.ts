/** The model adapter hq's own listening calls and recaps go through: each call's cost on the ledger, its outcome on the provider's health. */
import { createModelAdapter } from '../../model'
import { reportCall } from '../../../routing/resolver'

export const listenerModel = createModelAdapter({ report: reportCall })
