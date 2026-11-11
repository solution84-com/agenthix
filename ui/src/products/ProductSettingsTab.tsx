import { useState, useEffect } from 'react'
import type { ProductDetail, ProductActions } from './types'
import { FIELD } from '../primitives/controlStyles'
import { NativeSelect } from '../primitives/NativeSelect'
import { Button } from '../primitives/Button'
import { useAttentionWhen } from '../attention/useAttentionWhen'

interface ProductSettingsTabProps {
  product: ProductDetail
  actions: Pick<ProductActions, 'updateProduct' | 'deleteProduct'>
  onProductDeleted: () => void
}

export function ProductSettingsTab({ product, actions, onProductDeleted }: ProductSettingsTabProps) {
  const [name, setName] = useState(product.name)
  const [slug, setSlug] = useState(product.slug)
  const [description, setDescription] = useState(product.description ?? '')
  const [vision, setVision] = useState(product.visionStatement ?? '')
  const [status, setStatus] = useState<'active' | 'sunset'>(product.status === 'sunset' ? 'sunset' : 'active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setName(product.name)
    setSlug(product.slug)
    setDescription(product.description ?? '')
    setVision(product.visionStatement ?? '')
    setStatus(product.status === 'sunset' ? 'sunset' : 'active')
    setError('')
  }, [product.id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await actions.updateProduct({
        productId: product.id,
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        vision: vision.trim() || null,
        status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await actions.deleteProduct(product.id)
      onProductDeleted()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      <form onSubmit={handleSave} className="space-y-4">
        <h2 className="text-h2 font-medium text-text-secondary">General</h2>
        <label className="block space-y-1">
          <span className="text-small text-text-secondary">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} required />
        </label>
        <label className="block space-y-1">
          <span className="text-small text-text-secondary">Slug</span>
          <input value={slug} onChange={e => setSlug(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} required />
        </label>
        <label className="block space-y-1">
          <span className="text-small text-text-secondary">Description</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="text-small text-text-secondary">Vision Statement</span>
          <textarea value={vision} onChange={e => setVision(e.target.value)} rows={3} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="text-small text-text-secondary">Status</span>
          <NativeSelect value={status} onChange={e => setStatus(e.target.value as 'active' | 'sunset')}>
            <option value="active">Active</option>
            <option value="sunset">Sunset</option>
          </NativeSelect>
        </label>
        {errorDialog}
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>

      <div className="border-t border-border pt-6 space-y-2">
        <h2 className="text-h2 font-medium text-danger">Danger Zone</h2>
        <Button variant="danger" onClick={() => setShowDelete(true)}>
          Delete Product
        </Button>
        {showDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => setShowDelete(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 max-w-sm space-y-4">
              <h2 className="text-h2 font-medium text-text-primary">Delete "{product.name}"?</h2>
              <p className="text-body text-text-secondary">This action cannot be undone. Projects will be unassigned.</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancel</Button>
                <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
