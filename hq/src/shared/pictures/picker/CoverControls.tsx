/**
 * The Cover tab (boards/picker.html): the patterns as a grid, each drawn in the cover's colours; a look; two colours;
 * a linear or radial blend; a direction. *Another of this pattern* sits with the preview's buttons.
 */
import { useId } from 'react'
import { SegmentedControl } from '@agenthix/ui/primitives'
import { COVER_HUES, COVER_LOOKS, coverColourHex, type CoverHue, type CoverLook } from '../palette'
import type { PictureContext, PictureRecipe } from '../recipe'
import { COVER_PATTERNS } from '../styles/cover/patterns'
import { RecipeImage } from './PictureView'
import { Cell, CellGrid, Heading, Swatches } from './pickerParts'

const withChoices = (recipe: PictureRecipe, patch: Record<string, unknown>): PictureRecipe => ({ ...recipe, choices: { ...recipe.choices, ...patch } })
const LOOK_LABEL: Record<CoverLook, string> = { soft: 'Soft', vivid: 'Vivid', deep: 'Deep' }
const patternLabel = (p: string) => (p === 'none' ? 'None' : p.charAt(0).toUpperCase() + p.slice(1))

export function CoverControls({ ctx, draft, onChange }: { ctx: PictureContext; draft: PictureRecipe; onChange: (recipe: PictureRecipe) => void }) {
  const directionId = useId()
  const colours = draft.choices.colours as [CoverHue, CoverHue]
  const look = draft.choices.look as CoverLook
  const direction = draft.choices.direction as number
  const setColour = (slot: 0 | 1, hue: string) => onChange(withChoices(draft, { colours: slot === 0 ? [hue, colours[1]] : [colours[0], hue] }))

  return (
    <div>
      <Heading>Pattern</Heading>
      <CellGrid wide>
        {COVER_PATTERNS.map(pattern => (
          <Cell key={pattern} wide on={draft.choices.pattern === pattern} label={patternLabel(pattern)} onClick={() => onChange(withChoices(draft, { pattern }))}>
            <RecipeImage recipe={withChoices(draft, { pattern })} kind="cover" ctx={ctx} />
          </Cell>
        ))}
      </CellGrid>

      <Heading>Look</Heading>
      <SegmentedControl label="Look" options={COVER_LOOKS.map(l => ({ value: l, label: LOOK_LABEL[l] }))} value={look} onChange={l => onChange(withChoices(draft, { look: l }))} />

      <Heading>First colour</Heading>
      <Swatches label="First colour" names={COVER_HUES} chosen={colours[0]} fill={h => `#${coverColourHex(h as CoverHue, look, 0)}`} onChoose={h => setColour(0, h)} />
      <Heading>Second colour</Heading>
      <Swatches label="Second colour" names={COVER_HUES} chosen={colours[1]} fill={h => `#${coverColourHex(h as CoverHue, look, 1)}`} onChoose={h => setColour(1, h)} />

      <Heading>Blend</Heading>
      <SegmentedControl
        label="Blend"
        options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }]}
        value={draft.choices.blend as 'linear' | 'radial'}
        onChange={blend => onChange(withChoices(draft, { blend }))}
      />

      <Heading><label htmlFor={directionId}>Direction</label></Heading>
      <input
        id={directionId} type="range" min={0} max={359} step={1} value={direction}
        onChange={e => onChange(withChoices(draft, { direction: Number(e.target.value) }))}
        className="w-full accent-accent"
      />
    </div>
  )
}
