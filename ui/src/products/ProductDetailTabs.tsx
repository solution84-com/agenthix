type ProductTab = 'overview' | 'settings'

interface ProductDetailTabsProps {
  activeTab: ProductTab
  onTabChange: (tab: ProductTab) => void
}

export function ProductDetailTabs({ activeTab, onTabChange }: ProductDetailTabsProps) {
  // A product groups projects and owns nothing (ADR-0061) — no files, no
  // workspaces, no members. What is left is what it groups, and its own settings.
  const tabs: { id: ProductTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="flex gap-0 border-b border-border px-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          className={`shrink-0 whitespace-nowrap px-4 py-3 text-body border-b-2 transition-colors ${
            activeTab === t.id
              ? 'border-accent text-text-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export type { ProductTab }
