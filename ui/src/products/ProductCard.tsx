import type { ProductListItem } from './types'

interface ProductCardProps {
  product: ProductListItem
  href: string
  onClick?: () => void
}

export function ProductCard({ product, href, onClick }: ProductCardProps) {
  const statusColor = product.status === 'active'
    ? 'bg-success/15 text-success border-success/25'
    : 'bg-surface-2 text-text-muted border-border'

  return (
    <a
      href={href}
      onClick={onClick}
      className="block rounded-xl border border-border bg-surface-1 hover:border-accent transition-all p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-h3 font-medium text-text-primary leading-snug">{product.name}</h3>
        <span className={`shrink-0 text-small px-2 py-0.5 rounded-full border ${statusColor}`}>
          {product.status}
        </span>
      </div>
      <p className="text-small text-text-muted line-clamp-2">{product.description ?? 'No description'}</p>
      <p className="text-small text-text-muted">{product.projectCount} project{product.projectCount !== 1 ? 's' : ''}</p>
    </a>
  )
}
