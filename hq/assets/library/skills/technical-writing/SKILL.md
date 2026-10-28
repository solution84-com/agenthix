---
name: Technical Writing
description: Write changelogs, API docs, and internal guides in plain language
version: 2
suitedTo: [technical-writer, developer]
---

# Technical Writing

Write clearly for your audience. Assume they are busy and technically competent.

## Changelogs
- Group by type: Added, Changed, Fixed, Removed
- Write for the end user, not the developer
- One entry per change — no bundling unrelated items

## API documentation
- Every endpoint: description, request shape, response shape, error codes
- Include a working example for every operation
- Mark deprecated endpoints clearly

## Internal guides
- Start with the goal: what will the reader be able to do after reading?
- Use numbered steps for procedures
- Keep docs close to the code — update them in the same PR
