import { SegmentedControl } from '../primitives/SegmentedControl'

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
    <div className="border-b border-border px-6 py-2">
      <SegmentedControl kind="tabs" label="Product" value={activeTab} onChange={onTabChange} options={tabs.map(t => ({ value: t.id, label: t.label }))} />
    </div>
  )
}

export type { ProductTab }
