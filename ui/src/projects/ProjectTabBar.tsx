import type { ReactElement } from 'react'

export interface ProjectTab {
  label: string
  href: string
  active?: boolean
}

export interface ProjectTabBarProps {
  /** Project name shown above the tab list. */
  projectName?: string
  /** Project key — when provided, rendered as a small badge before the name. */
  projectKey?: string
  tabs: ProjectTab[]
  /** Wrapper element for each tab — pass react-router's Link or an `a` tag. */
  TabWrapper?: React.ElementType
}

export function ProjectTabBar({
  projectName,
  projectKey,
  tabs,
  TabWrapper = 'a',
}: ProjectTabBarProps): ReactElement {
  return (
    <div className="border-b border-border-subtle bg-surface-1 shrink-0 px-4 lg:px-8">
      <div className="flex items-baseline gap-2 pt-4 pb-2">
        {projectKey && (
          <span className="font-mono text-small bg-surface-3 px-1.5 py-0.5 rounded text-warning shrink-0">
            {projectKey}
          </span>
        )}
        <h1 className="text-h1 font-semibold text-text-primary">{projectName ?? '…'}</h1>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(tab => {
          const wrapperProps = TabWrapper === 'a' ? { href: tab.href } : { to: tab.href }
          return (
            <TabWrapper
              key={tab.href}
              {...wrapperProps}
              className={`px-3 h-9 flex items-center text-micro font-medium uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab.active
                  ? 'border-success text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </TabWrapper>
          )
        })}
      </div>
    </div>
  )
}
