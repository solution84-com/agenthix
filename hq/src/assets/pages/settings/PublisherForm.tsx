import { useState } from 'react'
import { useAction, addTrustedPublisher } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { FIELD as FIELD_LOOK, BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com'
const FIELD = `w-full rounded-lg px-3 py-1.5 text-body ${FIELD_LOOK}`
const PLAIN = `rounded-lg px-3 py-1.5 text-body ${BUTTON_SECONDARY}`

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-small font-medium text-text-primary">{label}</span>
      {children}
      {hint && <span className="block text-micro text-text-muted">{hint}</span>}
    </label>
  )
}

/**
 * Add a publisher whose signatures are trusted (board R2, P1): a keyless one (the exact identity, the repository, and
 * what may sign) or a public key. The server refuses anything that reads like a pattern, and says why.
 */
export function PublisherForm({ onAdded }: { onAdded: (message: string) => void }) {
  const add = useAction(addTrustedPublisher)
  const [kind, setKind] = useState<'keyless' | 'key'>('keyless')
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [issuer, setIssuer] = useState(GITHUB_ISSUER)
  const [identity, setIdentity] = useState('')
  const [repository, setRepository] = useState('')
  const [tags, setTags] = useState(true)
  const [branch, setBranch] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const submit = async () => {
    setState({ busy: true, error: null })
    try {
      const out = await add(kind === 'key'
        ? { kind, name: name.trim(), displayName: displayName.trim(), publicKey }
        : { kind, name: name.trim(), displayName: displayName.trim(), issuer: issuer.trim(), identity: identity.trim(), repository: repository.trim() || null, allowTags: tags, allowedBranch: branch.trim() || null })
      setState({ busy: false, error: null })
      onAdded(out.message)
    } catch (err) {
      setState({ busy: false, error: refusalText(err) })
    }
  }

  return (
    <form className="mt-3 space-y-3 rounded-lg border border-border-subtle p-3" data-testid="publisher-form" onSubmit={e => { e.preventDefault(); void submit() }}>
      <div role="radiogroup" aria-label="How it signs" className="flex gap-4 text-body text-text-primary">
        <label className="flex items-center gap-2"><input type="radio" className="accent-accent" name="kind" checked={kind === 'keyless'} onChange={() => setKind('keyless')} /> Keyless, with an identity</label>
        <label className="flex items-center gap-2"><input type="radio" className="accent-accent" name="kind" checked={kind === 'key'} onChange={() => setKind('key')} /> A public key</label>
      </div>
      <Field label="Name" hint="What it signs installs as name/…, such as acme/sql-review."><input className={FIELD} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Shown as"><input className={FIELD} value={displayName} onChange={e => setDisplayName(e.target.value)} /></Field>
      {kind === 'key' ? (
        <Field label="Public key" hint="In PEM form, beginning “-----BEGIN PUBLIC KEY-----”. Never paste a private key.">
          <textarea className={`${FIELD} font-mono`} rows={5} value={publicKey} onChange={e => setPublicKey(e.target.value)} />
        </Field>
      ) : (
        <>
          <Field label="Identity provider" hint="Its https:// address. For GitHub Actions it is already filled in."><input className={FIELD} value={issuer} onChange={e => setIssuer(e.target.value)} /></Field>
          <Field label="Certificate identity" hint="Exactly as signed, without the ref (the part from “@refs/”) and without wildcards."><input className={FIELD} value={identity} onChange={e => setIdentity(e.target.value)} /></Field>
          <Field label="Repository" hint="The https:// address the certificate names. Leave empty for a person's identity."><input className={FIELD} value={repository} onChange={e => setRepository(e.target.value)} /></Field>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-body text-text-primary"><input type="checkbox" className="accent-accent" checked={tags} onChange={e => setTags(e.target.checked)} /> Tags may sign</label>
            <Field label="One branch that may sign"><input className={FIELD} value={branch} placeholder="main" onChange={e => setBranch(e.target.value)} /></Field>
          </div>
        </>
      )}
      <ShowAttention text={state.error} title="The publisher was not trusted" />
      <button type="submit" disabled={state.busy || !name.trim()} className={PLAIN}>Trust this publisher</button>
    </form>
  )
}
