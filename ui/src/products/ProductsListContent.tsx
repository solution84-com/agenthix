import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProductCard } from './ProductCard'
import { deriveSlug } from '@agenthix/core'
import type { SiteOption } from '../primitives'
import type { ProductListItem, ProductActions } from './types'
import { FIELD, FOCUS_RING } from '../primitives/controlStyles'
import { Button } from '../primitives/Button'
import { useAttentionWhen } from '../attention/useAttentionWhen'

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
  const errorDialog = useAttentionWhen(error)
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
          <h1 className="text-h1 font-medium text-text-primary">Products</h1>
          <p className="text-body text-text-secondary">Manage your product lines and groupings</p>
        </div>
        {actions?.createProduct && (
          <Button
            onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Product
          </Button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 border border-border rounded-xl bg-surface-2">
          <p className="text-body text-text-secondary">No products yet</p>
          {actions?.createProduct && (
            <button
              onClick={() => setShowCreate(true)}
              className={`mt-3 text-body text-link hover:underline ${FOCUS_RING}`}
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
          <form onSubmit={handleCreate} onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-h2 font-medium text-text-primary">New Product</h2>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Name</span>
                <input value={name} onChange={e => { const v = e.target.value; setName(v); if (!slugTouched) setSlug(deriveSlug(v)) }} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} placeholder="My Product" required />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Slug (optional)</span>
                <input value={slug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} placeholder="my-product" />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Description (optional)</span>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
              </label>
            </div>
            {errorDialog}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
