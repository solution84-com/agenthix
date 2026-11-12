/**
 * The picker's starting point: the subject's picture context (its kind, name, Kernel or not, and the robots this build
 * carries) and a fresh default for any tab with no generated look, so Remove upload has one to go back to.
 */
import { useEffect, useMemo, useState } from 'react'
import { defaultAvatarRecipe, randomRecipe } from '../pictures'
import type { PictureContext, PictureRecipe } from '../recipe'
import { freshSeed } from '../random'
import { robotNames } from './robotFiles'
import { openPicker, type PickerState, type PickerTab, type SavedPicture } from './pickerState'
import { stylesFor } from '../styles'
import type { PickerPictures, PickerSubject } from './types'

const asRecipe = (r: unknown): PictureRecipe | null => (r ? (r as PictureRecipe) : null)

export function savedOf(saved: PickerPictures): { avatar: SavedPicture; cover: SavedPicture } {
  return {
    avatar: { url: saved.avatarUrl, recipe: asRecipe(saved.avatarRecipe) },
    cover: { url: saved.coverUrl, recipe: asRecipe(saved.coverRecipe) },
  }
}

export function usePickerOpen(subject: PickerSubject, saved: PickerPictures, tab: PickerTab): { ctx: PictureContext; opened: PickerState | null } {
  const ctx = useMemo<PictureContext>(
    () => ({ subject: { kind: subject.kind, name: subject.name, ...(subject.isKernel ? { isKernel: true } : {}) }, robots: robotNames() }),
    [subject.kind, subject.name, subject.isKernel],
  )
  const [opened, setOpened] = useState<PickerState | null>(null)
  useEffect(() => {
    let live = true
    const s = savedOf(saved)
    void Promise.all([
      s.avatar.recipe ? null : defaultAvatarRecipe(ctx, freshSeed()).catch(() => null),
      s.cover.recipe ? null : randomRecipe('patterns', freshSeed(), ctx).catch(() => null),
    ]).then(([avatar, cover]) => {
      if (live) setOpened(openPicker(s, { avatar, cover }, tab, stylesFor('avatar', ctx).length === 1))
    })
    return () => { live = false }
    // Opened once, from what was saved when the picker opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { ctx, opened }
}
