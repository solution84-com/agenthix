import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProductCard } from './ProductCard'
import { deriveSlug } from '@agenthix/core'
import type { SiteOption } from '../primitives'
import type { ProductListItem, ProductActions } from './types'

interface ProductsListContentProps {
  products: ProductListItem[]
  getProductHref: (product: ProductListItem) => string
  actions?: Pick<ProductActions, 'createProduct'>
  sites?: SiteOption[]
  defaultSelectedSiteId?: string
  onProductCreated?: (slug: string) => void
  onProductClick?: (product: ProductListItem) => void
}

export function ProductsListContent({ products, getProductHref, actions, onProductCreated, onProductClick }: ProductsListContentProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleClose = () => {
    setShowCreate(false)
    setName('')
    setSlug('')
    setSlugTouched(false)
    setDescription('')
    setError('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !actions?.createProduct) return
    setSaving(true)
    setError('')
    try {
      const result = await actions.createProduct({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
      })
      handleClose()
      onProductCreated?.(result.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-semibold text-text-primary">Products</h1>
          <p className="text-body text-text-secondary">Manage your product lines and groupings</p>
        </div>
        {actions?.createProduct && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-body bg-accent hover:bg-accent-hover text-on-accent rounded-lg"
          >
            <Plus size={16} /> New Product
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 border border-border rounded-xl bg-surface-2">
          <p className="text-body text-text-secondary">No products yet</p>
          {actions?.createProduct && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-body text-accent hover:text-accent"
            >
              Create your first product
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map(p => (
            <ProductCard key={p.id} product={p} href={getProductHref(p)} onClick={onProductClick ? () => onProductClick(p) : undefined} />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={handleClose}>
          <form onSubmit={handleCreate} onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-h2 font-semibold text-text-primary">New Product</h2>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Name</span>
                <input value={name} onChange={e => { const v = e.target.value; setName(v); if (!slugTouched) setSlug(deriveSlug(v)) }} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50" placeholder="My Product" required />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Slug (optional)</span>
                <input value={slug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50" placeholder="my-product" />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Description (optional)</span>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50 resize-none" />
              </label>
            </div>
            {error && <p className="text-small text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClose} className="px-3 py-1.5 text-body text-text-secondary hover:text-text-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 text-body bg-accent hover:bg-accent-hover text-on-accent rounded-lg disabled:opacity-50">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
