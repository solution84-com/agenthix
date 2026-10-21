import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAction } from 'wasp/client/operations'
import { updateProduct, deleteProduct } from 'wasp/client/operations'
import { deriveSlug } from '@agenthix/core'
import { FormField } from '../../../shared/components/ui/FormField'

const INPUT = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent'

interface Props {
  productId: string
  prod: any
}

export function SettingsTab({ productId, prod }: Props) {
  const navigate = useNavigate()
  const updateProductAction = useAction(updateProduct)
  const deleteProductAction = useAction(deleteProduct)

  const [name, setName] = useState(prod.name ?? '')
  const [slug, setSlug] = useState(prod.slug ?? '')
  const [desc, setDesc] = useState(prod.description ?? '')
  const [vision, setVision] = useState(prod.vision ?? '')
  const [status, setStatus] = useState<'active' | 'sunset'>(prod.status ?? 'active')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Re-sync when navigating between products
  useEffect(() => {
    setName(prod.name ?? '')
    setSlug(prod.slug ?? '')
    setDesc(prod.description ?? '')
    setVision(prod.vision ?? '')
    setStatus(prod.status ?? 'active')
    setSlugManuallyEdited(false)
  }, [prod.id])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!slugManuallyEdited) setSlug(deriveSlug(val))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateProductAction({
        productId,
        name: name.trim(),
        slug: slug.trim(),
        description: desc.trim() || null,
        vision: vision.trim() || null,
        status,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteProductAction({ productId })
      navigate('/products')
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <form onSubmit={handleSave} className="space-y-4">
        <FormField label="Name" htmlFor="set-name">
          <input id="set-name" value={name} onChange={e => handleNameChange(e.target.value)} required className={INPUT} />
        </FormField>
        <FormField label="Slug" htmlFor="set-slug">
          <input
            id="set-slug"
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugManuallyEdited(true) }}
            required
            className={`${INPUT} font-mono text-text-secondary`}
          />
          <p className="text-micro text-text-muted mt-1">Used in URLs and as the product's directory name on the server.</p>
        </FormField>
        <FormField label="Description" htmlFor="set-desc">
          <textarea id="set-desc" value={desc} onChange={e => setDesc(e.target.value)} rows={2} className={`${INPUT} resize-none`} />
        </FormField>
        <FormField label="Vision" htmlFor="set-vision">
          <textarea id="set-vision" value={vision} onChange={e => setVision(e.target.value)} rows={3} placeholder="Where is this product headed long-term?" className={`${INPUT} resize-none`} />
        </FormField>
        <FormField label="Status" htmlFor="set-status">
          <select id="set-status" value={status} onChange={e => setStatus(e.target.value as 'active' | 'sunset')} className={INPUT}>
            <option value="active">Active</option>
            <option value="sunset">Sunset</option>
          </select>
        </FormField>
        {error && <div className="px-3 py-2 rounded-xl bg-danger/10 border border-danger/20 text-danger text-body">{error}</div>}
        <button type="submit" disabled={saving || !name.trim() || !slug.trim()} className="px-4 py-2 text-body font-medium bg-accent hover:bg-accent-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </form>

      <div className="pt-4 border-t border-border-subtle space-y-3">
        <div className="text-micro font-medium text-danger/50">Danger Zone</div>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} className="px-4 py-2 text-body font-medium text-danger border border-danger/20 hover:bg-danger/10 rounded-lg transition-colors">
            Delete Product
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-danger/5 border border-danger/15 space-y-3">
            <p className="text-body text-text-secondary">This will unlink all projects from this product. Projects themselves are not deleted.</p>
            {deleteError && <div className="text-body text-danger">{deleteError}</div>}
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 text-body text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-1.5 text-body font-medium bg-danger hover:bg-danger-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors">
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
