import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAction } from 'wasp/client/operations'
import { updateProduct, deleteProduct } from 'wasp/client/operations'
import { deriveSlug } from '@agenthix/core'
import { FormField } from '../../../shared/components/ui/FormField'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { FIELD, Button, NativeSelect } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

const INPUT = `w-full rounded-lg ${FIELD} px-3 py-2 text-body`

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
          <NativeSelect id="set-status" value={status} onChange={e => setStatus(e.target.value as 'active' | 'sunset')}>
            <option value="active">Active</option>
            <option value="sunset">Sunset</option>
          </NativeSelect>
        </FormField>
        <ShowAttention text={error} title="The product was not saved" onClose={() => setError('')} />
        <Button type="submit" disabled={saving || !name.trim() || !slug.trim()}>
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </Button>
      </form>

      <div className="pt-4 border-t border-border-subtle space-y-3">
        <div className="text-micro font-medium text-danger">Danger Zone</div>
        <button onClick={() => setShowDelete(true)} disabled={deleting} className="px-4 py-2 text-body font-medium text-danger border border-danger/20 hover:bg-danger/10 rounded-lg transition-colors">
          {deleting ? 'Deleting...' : 'Delete Product'}
        </button>
        <ConfirmDialog
          open={showDelete}
          title="Delete this product?"
          description="This will unlink all projects from this product. Projects themselves are not deleted."
          confirmLabel="Delete product"
          destructive
          onConfirm={() => { setShowDelete(false); void handleDelete() }}
          onCancel={() => setShowDelete(false)}
        />
      </div>
      <ShowAttention text={deleteError} title="The product was not deleted" onClose={() => setDeleteError('')} />
    </div>
  )
}
