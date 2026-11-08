import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, Menu, X } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { useNavDrawer } from '../context/NavDrawerContext'
import { DockPhoneButton } from '../../dock/DockPhoneButton'
import { PhoneActionsMenu } from './PhoneActionsMenu'
import { usePublishedPhoneActions, usePublishedPhoneSelection, type PhoneAction } from './phoneActions'
import { useShellCounts } from './useShellCounts'
import { somethingNeedsYou } from './shellCountWords'
import { TOP_BAR_BUTTON } from './topBarStyles'

export { TOP_BAR_BUTTON }

/** ☰: the main drawer, the same everywhere, with a dot while something needs the person (its rows say what). */
export function MenuButton() {
  const { openDrawer } = useNavDrawer()
  const counts = useShellCounts()
  const needs = somethingNeedsYou(counts)
  const waiting = counts.unreadNotifications + counts.runsNeedingYou
  return (
    <button type="button" onClick={openDrawer} aria-label={needs ? `Open menu, ${waiting} need you` : 'Open menu'} className={`relative ${TOP_BAR_BUTTON}`}>
      <Menu size={18} aria-hidden />
      {needs && <span aria-hidden data-testid="menu-dot" className="absolute right-[9px] top-[9px] h-[9px] w-[9px] rounded-full bg-warning ring-2 ring-surface-1" />}
    </button>
  )
}

/** ‹ Back, on a screen inside a place or a sub-page. */
export function BackButton({ to, label = 'Back' }: { to: string; label?: string }) {
  return <Link to={to} aria-label={label} className={TOP_BAR_BUTTON}><ChevronLeft size={18} aria-hidden /></Link>
}

/** A screen's title in the top bar, and what it is in (a project's name) small underneath. */
export function TopBarTitle({ title, under }: { title: string; under?: string }) {
  return (
    <>
      <span className="min-w-0 truncate text-h3 font-semibold leading-tight text-text-primary">{title}</span>
      {under && <span className="min-w-0 truncate text-micro leading-tight text-text-muted">{under}</span>}
    </>
  )
}

/**
 * The phone's top bar, the one every screen below `lg` draws (spec, *The phone*): ☰ or ‹ Back, the title, then the chat
 * and one ⋯ — two icons at the right, never more. The ⋯ holds the screen's actions, the main one first: those the bar
 * is given (`actions`), then those the screen published (`usePhoneActions`); on a project's screen the last item opens
 * the project's menu (`placeMenu`). Notifications and Runs are rows in the ☰ drawer, not here.
 */
export function TopBar({ leading, children, actions = [], placeMenu = null }: {
  leading: ReactNode
  children: ReactNode
  actions?: PhoneAction[]
  placeMenu?: { name: string; onOpen: () => void } | null
}) {
  const published = usePublishedPhoneActions()
  const selection = usePublishedPhoneSelection()
  if (selection) {
    return (
      <header data-testid="mobile-header" data-selecting className="lg:hidden relative h-12 shrink-0 flex items-center gap-1 px-1 border-b border-border-subtle bg-surface-1">
        <button type="button" onClick={selection.onCancel} aria-label="Cancel: leave selection" className={TOP_BAR_BUTTON}><X size={18} aria-hidden /></button>
        <div className="flex min-w-0 flex-1 flex-col justify-center"><TopBarTitle title={`${selection.count} selected`} under={selection.under} /></div>
        <PhoneActionsMenu actions={selection.actions} label="Actions for the selection" />
      </header>
    )
  }
  return (
    <header data-testid="mobile-header" className="lg:hidden relative h-12 shrink-0 flex items-center gap-1 px-1 border-b border-border-subtle bg-surface-1">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col justify-center">{children}</div>
      <div className="flex shrink-0 items-center">
        <DockPhoneButton />
        <PhoneActionsMenu actions={[...actions, ...published]} placeMenu={placeMenu} />
      </div>
    </header>
  )
}

/**
 * A form on a phone is a focused page (spec, *The phone*): ✕ (Cancel), the title, and one filled button. `formId`
 * makes the button submit that form, so the form keeps its own submit.
 */
export function FormTopBar({ title, under, onCancel, submit }: {
  title: string
  under?: string
  onCancel: () => void
  submit: { label: string; formId?: string; onClick?: () => void; disabled?: boolean; why?: string }
}) {
  return (
    <header data-testid="mobile-header" className="lg:hidden h-12 shrink-0 flex items-center gap-1 pl-1 pr-1.5 border-b border-border-subtle bg-surface-1">
      <button type="button" onClick={onCancel} aria-label="Cancel" className={TOP_BAR_BUTTON}><X size={18} aria-hidden /></button>
      <div className="flex min-w-0 flex-1 flex-col justify-center"><TopBarTitle title={title} under={under} /></div>
      <Button
        type={submit.formId ? 'submit' : 'button'}
        form={submit.formId}
        onClick={submit.onClick}
        disabled={submit.disabled}
        title={submit.why}
      >
        {submit.label}
      </Button>
    </header>
  )
}
