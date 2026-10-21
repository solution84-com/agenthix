---
name: API Development
description: Design RESTful endpoints, keep data models normalised, document changes
---

# API Development

Design APIs that are predictable and documented.

## Endpoint design
- RESTful: resource-based URLs, correct HTTP verbs
- Return consistent error shapes: `{ error: string, code?: string }`
- Validate inputs at the boundary — never trust caller input
- Return 400 for bad input, 404 for missing resource, 500 for server errors

## Data models
- Normalise: each piece of data in one place
- Use consistent ID formats (UUID or cuid)
- Add `createdAt` and `updatedAt` to all persistent models

## Documentation
- Update API docs when you add or change endpoints
- Include request/response examples
- Note breaking changes explicitly
