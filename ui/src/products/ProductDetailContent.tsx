import { useState, useEffect } from 'react'
import type { SiteOption } from '../primitives'
import type { ProductDetail, AllProject, ProductActions } from './types'
import { ProductDetailHeader } from './ProductDetailHeader'
import { ProductDetailTabs } from './ProductDetailTabs'
import type { ProductTab } from './ProductDetailTabs'
import { ProductOverviewTab } from './ProductOverviewTab'
import { ProductSettingsTab } from './ProductSettingsTab'

interface ProductDetailContentProps {
  product: ProductDetail
  allProjects: AllProject[]
  actions: ProductActions
  onProductDeleted: () => void
  // Optional + defaulted, not required: a sibling copy of this component
  // (a parked client outside this repository) also renders it and may not supply this yet.
  sites?: SiteOption[]
}

export function ProductDetailContent({
  product,
  allProjects,
  actions,
  onProductDeleted,
  sites = [],
}: ProductDetailContentProps) {
  const [activeTab, setActiveTab] = useState<ProductTab>('overview')

  useEffect(() => {
    setActiveTab('overview')
  }, [product.id])

  return (
    <div className="flex flex-col h-full">
      <ProductDetailHeader product={product} />
      <ProductDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <ProductOverviewTab product={product} allProjects={allProjects} actions={actions} sites={sites} />
        )}
        {activeTab === 'settings' && (
          <ProductSettingsTab product={product} actions={actions} onProductDeleted={onProductDeleted} />
        )}
      </div>
    </div>
  )
}
