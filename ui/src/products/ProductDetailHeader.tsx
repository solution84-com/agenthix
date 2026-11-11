import type { ProductDetail } from './types'

interface ProductDetailHeaderProps {
  product: ProductDetail
}

export function ProductDetailHeader({ product }: ProductDetailHeaderProps) {
  const statusColor = product.status === 'active'
    ? 'bg-success/15 text-success border-success/25'
    : 'bg-surface-2 text-text-muted border-border'

  return (
    <div className="px-6 pt-6 pb-4 border-b border-border space-y-1">
      <div className="flex items-center gap-3">
        <h1 className="text-h1 font-medium text-text-primary">{product.name}</h1>
        <span className={`text-small px-2 py-0.5 rounded-full border ${statusColor}`}>{product.status}</span>
      </div>
      <p className="text-small text-text-muted">/{product.slug}</p>
      {product.visionStatement && (
        <p className="text-body text-text-secondary pt-1">{product.visionStatement}</p>
      )}
    </div>
  )
}
