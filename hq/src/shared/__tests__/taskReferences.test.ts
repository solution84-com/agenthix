/** How an agent names a task or one of its files (spec part 3, *Chips in conversations › Tasks and their files*). */
import { describe, it, expect } from 'vitest'
import { attachmentReference, readTaskReference, referencePart, taskReferenceOf, writeTaskReference } from '../taskReferences'

const ID = '0b9f6a52-3c1d-4e8a-9f27-5d6c1b2a7e40'
const parts = (s: string) => s.split('/')

describe('taskReferenceOf @SC-1548', () => {
  it('reads a task by its key or its id', () => {
    expect(taskReferenceOf(parts('tasks/MOP-1'))).toEqual({ kind: 'task', task: 'MOP-1' })
    expect(taskReferenceOf(parts(`tasks/${ID}`))).toEqual({ kind: 'task', task: ID })
  })

  it("reads a file in the task's folder, at any depth", () => {
    expect(taskReferenceOf(parts('tasks/MOP-1/notes.md'))).toEqual({ kind: 'working', task: 'MOP-1', path: 'notes.md' })
    expect(taskReferenceOf(parts(`tasks/${ID}/out/report.pdf`))).toEqual({ kind: 'working', task: ID, path: 'out/report.pdf' })
  })

  it('reads an attachment by its one file name', () => {
    expect(taskReferenceOf(parts('attachments/MOP-1/screenshot.png'))).toEqual({ kind: 'attachment', task: 'MOP-1', name: 'screenshot.png' })
  })

  it('reads nothing else', () => {
    for (const bad of ['tasks', 'tasks/done', 'tasks/mop-1', 'tasks/MOP-1/../x', 'tasks/MOP-1/./x', 'attachments/MOP-1',
      'attachments/MOP-1/a/b.png', 'attachments/not-a-task/a.png', 'files/MOP-1', 'tasks/MOPMOPM-1']) {
      expect(taskReferenceOf(parts(bad)), bad).toBeNull()
    }
  })
})

describe('the written form @SC-1548', () => {
  it('reads back what it writes', () => {
    for (const ref of ['tasks/MOP-1', 'tasks/MOP-1/a/b.md', 'attachments/MOP-1/a b.png']) {
      expect(writeTaskReference(readTaskReference(ref)!)).toBe(ref)
    }
    expect(readTaskReference(42)).toBeNull()
  })

  it("encodes the characters that would end a reference in text, so an attachment's reference reads back whole", () => {
    expect(referencePart("my notes (v2)'s.md")).toBe('my%20notes%20%28v2%29%27s.md')
    expect(referencePart('100%.md')).toBe('100%25.md')
    expect(attachmentReference('MOP-1', 'shot one.png')).toBe('attachments/MOP-1/shot%20one.png')
    expect(decodeURIComponent(attachmentReference('MOP-1', "my notes (v2)'s.md"))).toBe("attachments/MOP-1/my notes (v2)'s.md")
  })
})
