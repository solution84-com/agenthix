import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from '@agenthix/ui/primitives'
import { Link } from '../router'
import { HOME } from '../shell/menu'
import { PageHeading } from './Headings'

/** Catches a screen that throws while it draws, so the menu stays and the person has a way back. Keyed by the path, it clears on navigating. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A Fleet Console screen failed to draw.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <>
        <PageHeading title="Something went wrong" />
        <EmptyState
          title="This screen could not be drawn."
          action={<Link to={HOME} className="text-small font-semibold text-text-primary underline">Go to the dashboard</Link>}
        />
      </>
    )
  }
}
