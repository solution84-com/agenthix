/**
 * The host service's own container, as the CLI running inside it names it to a person: from the namespace the host
 * service recorded in the state folder, or a new install's before there is one.
 */
import { DEFAULT_INSTALL_NAMESPACE } from '@agenthix/core'
import { STATE_DIR } from '../config'
import { StateFolder } from '../state/folder'
import { namesFor } from '../state/namespace'
import { recordedNamespace } from '../state/installation'

let known: string | null = null

export function hostContainer(): string {
  if (known) return known
  let ns: string | null = null
  try {
    ns = recordedNamespace(new StateFolder(STATE_DIR))
  } catch {
    // Unreadable: the name a new install gets is the best this can say.
  }
  known = namesFor(ns ?? DEFAULT_INSTALL_NAMESPACE).hostContainer
  return known
}
