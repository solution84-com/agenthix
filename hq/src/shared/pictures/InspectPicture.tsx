/**
 * The inspect view (generated avatars and covers spec, *A small copy of every picture*): an avatar opened full size
 * from an agent's or a person's page. It asks for the full picture; everywhere else shows the small copy. Someone who
 * may change the picture has Change picture here too.
 */
import { Button, Modal } from '@agenthix/ui/primitives'
import { AuthedImg } from '../components/AuthedImg'

export function InspectPicture({ open, name, avatarUrl, round = true, onClose, onChange }: {
  open: boolean
  name: string
  /** The stored path of the avatar. */
  avatarUrl: string | null
  round?: boolean
  onClose: () => void
  /** Left out for anyone who may not change it. */
  onChange?: () => void
}) {
  return (
    <Modal open={open && avatarUrl !== null} onClose={onClose} title={`${name}'s picture`} closeLabel="Close" maxWidth="max-w-xl">
      <div className={`relative mx-auto aspect-square w-full max-w-md overflow-hidden bg-surface-2 ${round ? 'rounded-full' : 'rounded-3xl'}`}>
        <AuthedImg src={avatarUrl} size="full" alt={`${name}'s picture`} className="absolute inset-0 h-full w-full object-cover" />
      </div>
      {onChange && (
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={() => { onClose(); onChange() }}>Change picture</Button>
        </div>
      )}
    </Modal>
  )
}
