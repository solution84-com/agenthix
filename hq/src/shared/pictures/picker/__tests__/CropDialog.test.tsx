// @vitest-environment jsdom
/** The crop frame outside the picker: the picker's own frame, and a confirm that sends what cropAndCompress made. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const crop = vi.hoisted(() => vi.fn())
vi.mock('../../upload/cropAndCompress', async importOriginal => ({ ...await importOriginal<object>(), cropAndCompress: crop }))

import CropDialog from '../CropDialog'

URL.createObjectURL = () => 'blob:chosen'
URL.revokeObjectURL = () => {}
afterEach(() => { cleanup(); crop.mockReset() })

const file = new File(['x'], 'me.png', { type: 'image/png' })

describe('the crop dialog @SC-2010', () => {
  it('shows the frame for the kind and sends the cropped picture on confirm', async () => {
    crop.mockResolvedValue('data:image/webp;base64,BBBB')
    const onConfirm = vi.fn()
    render(<CropDialog file={file} kind="cover" minSide={0} onCancel={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByTestId('crop-frame')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use this picture' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('data:image/webp;base64,BBBB'))
    expect(crop).toHaveBeenCalledWith(file, 'cover', { crop: null, minSide: 0 })
  })

  it('says why a picture cannot be used and keeps the frame open', async () => {
    crop.mockRejectedValue(new Error('That image is too small. Choose one at least 256×256.'))
    const onConfirm = vi.fn()
    render(<CropDialog file={file} kind="avatar" minSide={256} onCancel={() => {}} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use this picture' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/too small/)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('crop-frame')).toBeTruthy()
  })

  it('Cancel sends nothing', () => {
    const onCancel = vi.fn(); const onConfirm = vi.fn()
    render(<CropDialog file={file} kind="avatar" onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled(); expect(onConfirm).not.toHaveBeenCalled()
  })
})
