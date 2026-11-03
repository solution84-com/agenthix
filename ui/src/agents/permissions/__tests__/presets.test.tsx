import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PERMISSION_PRESETS } from '../../tabs/permissionPresets'
import { PresetChips } from '../PresetChips'

afterEach(cleanup)

describe('permission presets promise no more than their patterns allow', () => {
  it('no preset says it runs no code while it runs any command without asking', () => {
    for (const preset of PERMISSION_PRESETS) {
      const runsCommands = preset.bashPatterns.some(p => p.state === 'always')
      if (runsCommands) expect(preset.description, preset.id).not.toMatch(/no code execution|no bash/i)
    }
  })

  it('no preset allows a command by a leading variable assignment, which can run any program', () => {
    for (const preset of PERMISSION_PRESETS) {
      for (const p of preset.bashPatterns) expect(p.pattern, preset.id).not.toMatch(/^\s*[A-Za-z_][A-Za-z0-9_]*=/)
    }
  })

  it('the selected preset says what it grants', () => {
    const presets = PERMISSION_PRESETS.map(p => ({ id: p.id, label: p.label, description: p.description }))
    render(<PresetChips presets={presets} selected="product-manager" readOnly={false} onPick={() => {}} />)
    expect(screen.getByText(PERMISSION_PRESETS.find(p => p.id === 'product-manager')!.description)).toBeTruthy()
  })
})
