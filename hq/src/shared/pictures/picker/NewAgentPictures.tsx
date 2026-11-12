/**
 * The create-agent dialog's pictures (the spec's *The defaults*): a random robot on a random background (a Thumbs
 * character where the robots are missing) and a random cover, shown with Change to open the picker. What is shown is
 * what the new agent gets: the dialog saves these once the agent is made.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import type { PictureRecipeView } from '@agenthix/core'
import { defaultAvatarRecipe, randomRecipe } from '../pictures'
import { freshSeed } from '../random'
import type { PictureContext, PictureKind, PictureRecipe } from '../recipe'
import { PicturePicker } from '.'
import { RecipeImage } from './PictureView'
import { robotNames } from './robotFiles'
import type { PictureChanges } from './types'

function Shown({ changes, kind, ctx }: { changes: PictureChanges; kind: PictureKind; ctx: PictureContext }) {
  const change = changes[kind]
  if (change && 'recipe' in change) return <RecipeImage recipe={change.recipe as unknown as PictureRecipe} kind={kind} ctx={ctx} />
  if (change && 'upload' in change) return <img src={change.upload} alt="" className="absolute inset-0 h-full w-full object-cover" />
  return null
}

const recipeOf = (changes: PictureChanges, kind: PictureKind): PictureRecipeView | null => {
  const change = changes[kind]
  return change && 'recipe' in change ? change.recipe : null
}

export default function NewAgentPictures({ name, value, onChange }: {
  name: string
  value: PictureChanges | null
  onChange: (changes: PictureChanges) => void
}) {
  const ctx = useMemo<PictureContext>(() => ({ subject: { kind: 'agent', name }, robots: robotNames() }), [name])
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    if (value) return
    void Promise.all([defaultAvatarRecipe(ctx, freshSeed()), randomRecipe('patterns', freshSeed(), ctx)]).then(([avatar, cover]) => {
      onChange({
        ...(avatar ? { avatar: { recipe: avatar as unknown as PictureRecipeView } } : {}),
        cover: { recipe: cover as unknown as PictureRecipeView },
      })
    }, () => {})
    // Drawn once for each new agent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-2">
        {value && <Shown changes={value} kind="avatar" ctx={ctx} />}
      </div>
      <div className="relative h-14 min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2">
        {value && <Shown changes={value} kind="cover" ctx={ctx} />}
      </div>
      <Button size="sm" variant="secondary" disabled={!value} onClick={() => setPicking(true)}>Change</Button>
      <PicturePicker
        open={picking} onClose={() => setPicking(false)}
        subject={{ kind: 'agent', name, role: 'A new agent' }}
        saved={{ avatarUrl: null, avatarRecipe: value ? recipeOf(value, 'avatar') : null, coverUrl: null, coverRecipe: value ? recipeOf(value, 'cover') : null }}
        save={async changes => { onChange({ ...value, ...changes }) }}
      />
    </div>
  )
}
