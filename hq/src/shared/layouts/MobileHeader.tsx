import { MenuButton, TopBar, TopBarTitle } from './TopBar'

/** Below the `lg` breakpoint: ☰ opens the main drawer; the screen's title; the chat, notifications and Runs at the right. */
export function MobileHeader({ title }: { title: string }) {
  return <TopBar leading={<MenuButton />}><TopBarTitle title={title} /></TopBar>
}
