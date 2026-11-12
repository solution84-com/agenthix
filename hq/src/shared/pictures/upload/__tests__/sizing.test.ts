import { describe, expect, it } from 'vitest'
import { centreCoverRect, clampRect, cropPlan, outputSize } from '../sizing'
import { dataUrlBytes, imageFileProblem } from '../cropAndCompress'

describe("an upload's crop @SC-2010", () => {
  it('keeps the centre of the picture in the frame\'s shape when nothing was cropped', () => {
    expect(centreCoverRect({ width: 4000, height: 3000 }, 1)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 })
    expect(centreCoverRect({ width: 3000, height: 3000 }, 3)).toEqual({ x: 0, y: 1000, width: 3000, height: 1000 })
    expect(cropPlan({ width: 900, height: 1600 }, 'avatar')).toEqual({ rect: { x: 0, y: 350, width: 900, height: 900 }, output: { width: 900, height: 900 } })
  })

  it('scales down to the stored size and never enlarges', () => {
    expect(outputSize({ width: 3000, height: 3000 }, 'avatar')).toEqual({ width: 1024, height: 1024 })
    expect(outputSize({ width: 6000, height: 2000 }, 'cover')).toEqual({ width: 1500, height: 500 })
    expect(outputSize({ width: 300, height: 300 }, 'avatar')).toEqual({ width: 300, height: 300 })
    expect(outputSize({ width: 600, height: 200 }, 'cover')).toEqual({ width: 600, height: 200 })
  })

  it('cuts the frame the person chose, kept inside the picture', () => {
    expect(cropPlan({ width: 2000, height: 2000 }, 'cover', { x: 100.4, y: 200, width: 1800, height: 600 }))
      .toEqual({ rect: { x: 100, y: 200, width: 1800, height: 600 }, output: { width: 1500, height: 500 } })
    expect(clampRect({ x: -20, y: 50, width: 5000, height: 5000 }, { width: 1000, height: 800 })).toEqual({ x: 0, y: 50, width: 1000, height: 750 })
  })
})

describe('a chosen file @SC-2010', () => {
  const file = (type: string, size: number, name = 'photo') => ({ type, size, name }) as File
  it('is taken whatever its size when it is a picture, and refused before it is read when it is not', () => {
    expect(imageFileProblem(file('', 1000, 'IMG_0001.HEIC'))).toBeNull()
    expect(imageFileProblem(file('', 1000, 'notes.txt'))).toMatch(/not a picture/)
    expect(imageFileProblem(file('image/png', 1000))).toBeNull()
    expect(imageFileProblem(file('image/heic', 1000))).toBeNull()
    expect(imageFileProblem(file('image/jpeg', 40 * 1024 * 1024))).toBeNull()
    expect(imageFileProblem(file('application/pdf', 1000))).toMatch(/not a picture/)
  })

  it('is measured as the bytes its data URL carries', () => {
    expect(dataUrlBytes(`data:image/webp;base64,${Buffer.from('abcd').toString('base64')}`)).toBe(4)
    expect(dataUrlBytes(`data:image/webp;base64,${Buffer.from('abcde').toString('base64')}`)).toBe(5)
  })
})
