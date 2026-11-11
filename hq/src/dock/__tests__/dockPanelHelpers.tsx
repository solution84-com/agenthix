/**
 * The panel's controls for the dock's tests: the bar's one button, and the conversation menu's placement entry. The
 * tests mock the thread, so the mock draws `PanelMenu`, the real menu with the real entry, where the thread's header is.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { ConversationHeaderTools } from '../../conversations/components/ConversationHeaderTools'
import { usePanelPlacement } from '../panelPlacement'

export function PanelMenu() {
  return <ConversationHeaderTools canDelete={false} onDelete={() => undefined} panel={usePanelPlacement()} />
}

const toggleButton = () => within(screen.getByTestId('dock-bar')).getByTestId('dock-state')
export const isOpen = () => toggleButton().getAttribute('aria-expanded') === 'true'

/** The bar's one button. */
export const toggle = () => fireEvent.click(toggleButton())

function chooseInMenu(name: string) {
  const dock = screen.getByTestId('dock')
  fireEvent.click(within(dock).getByRole('button', { name: 'Conversation menu' }))
  fireEvent.click(within(dock).getByRole('menuitem', { name }))
}

export const overThePage = () => chooseInMenu('Over the page')
export const besideThePage = () => chooseInMenu('Back beside the page')

/** Puts the panel in a state by what a person does: the bar's button, then the menu's entry. */
export function state(name: 'Minimised (⌘J)' | 'Beside the page' | 'Over the page') {
  const position = screen.getByTestId('dock').getAttribute('data-position')
  if (name === 'Minimised (⌘J)') { if (position !== 'collapsed') toggle(); return }
  if (position === 'collapsed') toggle()
  const now = screen.getByTestId('dock').getAttribute('data-position')
  if (name === 'Over the page' && now !== 'expanded') overThePage()
  if (name === 'Beside the page' && now === 'expanded') besideThePage()
}
