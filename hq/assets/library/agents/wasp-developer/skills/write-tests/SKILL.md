---
name: Write Tests
description: Write Vitest unit tests for new or modified server-side logic in a Wasp codebase.
---

# Write Tests

Use this skill to write tests for non-trivial server logic. The test suite uses **Vitest** in a Node environment.

## Where Tests Live

Colocated with source, in `__tests__/` directories:
- `src/agents/__tests__/`
- `src/projects/__tests__/`
- `src/auth/__tests__/`

File naming: `<feature>.test.ts`

## Test File Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Wasp server module first — before any imports that use it
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  },
  prisma: {
    myModel: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    }
  }
}))

import { prisma } from 'wasp/server'
import { myServiceFunction } from '../myService'

describe('myServiceFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the expected result when input is valid', async () => {
    const mockData = { id: '1', name: 'Test' }
    vi.mocked(prisma.myModel.findUnique).mockResolvedValue(mockData)

    const result = await myServiceFunction({ id: '1' })

    expect(result).toEqual(mockData)
    expect(prisma.myModel.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
  })

  it('throws when the record does not exist', async () => {
    vi.mocked(prisma.myModel.findUnique).mockResolvedValue(null)

    await expect(myServiceFunction({ id: 'missing' }))
      .rejects.toThrow()
  })
})
```

## What to Test

**Test:** Service functions — the business logic layer
**Test:** Edge cases — null inputs, missing records, invalid states
**Test:** Auth-gated paths — that missing context.user throws the right error

**Do not test:** Wasp-generated code, Prisma Client itself, React components (no DOM environment)

## Running Tests

```bash
npm test          # run all tests once
npm test -- --watch  # watch mode during development
```

## Rules

- Always mock `wasp/server` using `vi.mock()` at the top of the file — before importing the subject under test
- Use `vi.clearAllMocks()` in `beforeEach` to prevent state leakage between tests
- Test behaviour, not implementation — assert on return values and side effects, not internal calls unless necessary
- A test that always passes is worse than no test — make sure failure cases are covered
