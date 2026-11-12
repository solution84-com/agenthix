// @vitest-environment jsdom
/**
 * The picker (boards/picker.html, boards/picker-gallery.html): the Avatar tab's gallery of looks on the subject's own
 * name, then a look's fine-tuning, then Save with what was chosen; a failed Save is the attention dialog with Try
 * again, the picker still open with its choices; and the crop frame's keys.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('../../../components/AuthedImg', () => ({ AuthedImg: () => null }))

import PicturePickerDialog from '../PicturePickerDialog'
import { UploadPane } from '../UploadPane'

afterEach(cleanup)

const person = { kind: 'person' as const, name: 'Avery Chen', role: 'Member' }
const nothingSaved = { avatarUrl: null, avatarRecipe: null, coverUrl: '/people/p/images/c.webp', coverRecipe: null }

describe('the picker', () => {
  it("shows a person the faces and Initials only, chooses a look, fine-tunes it, and saves both tabs' choices", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<PicturePickerDialog subject={person} saved={nothingSaved} onClose={onClose} save={save} />)

    expect(await screen.findByRole('region', { name: 'Faces' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Initials' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Robots' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Symbols' })).toBeNull()

    const thumbs = await screen.findByRole('button', { name: /^Thumbs/ })
    await waitFor(() => expect((thumbs as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(thumbs)
    expect(await screen.findByRole('button', { name: '← All looks' })).toBeTruthy()
    // Thumbs' parts as chips, each option drawn on this subject.
    const chips = await screen.findAllByRole('button', { pressed: false })
    expect(chips.length).toBeGreaterThan(3)
    const option = screen.getAllByRole('button').find(b => /^variant/.test(b.getAttribute('aria-label') ?? '') && b.getAttribute('aria-pressed') === 'false')!
    fireEvent.click(option)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    const sent = save.mock.calls[0][0]
    expect(sent.avatar.recipe).toMatchObject({ kind: 'avatar', style: 'thumbs' })
    expect(sent.cover).toBeUndefined()
    expect(onClose).toHaveBeenCalled()
  })

  it('says why a Save failed, with Try again, and keeps the picker open with its choices', async () => {
    const refusal = Object.assign(new Error('That is many pictures saved in a minute.'), { statusCode: 429 })
    const save = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<PicturePickerDialog subject={person} saved={nothingSaved} onClose={onClose} save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Surprise me' }))
    await waitFor(() => expect(screen.getByTestId('picker-preview').querySelector('img')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/many pictures saved in a minute/)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('offers a team Initials alone, straight to its colours, and Remove says there is nothing to remove', async () => {
    render(<PicturePickerDialog subject={{ kind: 'team', name: 'Design team' }} saved={{ avatarUrl: null, coverUrl: null }} onClose={() => {}} save={async () => {}} />)
    expect(await screen.findByRole('radiogroup', { name: 'Background' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '← All looks' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove upload' }).getAttribute('aria-disabled')).toBe('true')
  })
})

describe('the crop frame', () => {
  const upload = { file: new File(['x'], 'me.png', { type: 'image/png' }), url: 'blob:me', crop: null, area: null }
  it('zooms with + and − and the slider, and Reset fits the picture again', () => {
    render(<UploadPane kind="avatar" upload={upload} onUpload={() => {}} onCrop={() => {}} onProblem={() => {}} />)
    const zoom = screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement
    const frame = screen.getByTestId('crop-frame')
    expect(zoom.value).toBe('1')
    act(() => { fireEvent.keyDown(frame, { key: '+' }) })
    act(() => { fireEvent.keyDown(frame, { key: '+' }) })
    expect(zoom.value).toBe('1.2')
    act(() => { fireEvent.keyDown(frame, { key: '-' }) })
    expect(zoom.value).toBe('1.1')
    fireEvent.change(zoom, { target: { value: '3' } })
    expect(zoom.value).toBe('3')
    fireEvent.click(within(frame.parentElement!).getByRole('button', { name: 'Reset' }))
    expect(zoom.value).toBe('1')
  })

  it('says why a file that is not a picture cannot be used', async () => {
    const onProblem = vi.fn()
    render(<UploadPane kind="cover" upload={null} onUpload={() => {}} onCrop={() => {}} onProblem={onProblem} />)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(onProblem).toHaveBeenCalledWith(expect.stringMatching(/not a picture/)))
  })
})
