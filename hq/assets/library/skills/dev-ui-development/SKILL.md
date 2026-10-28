---
name: UI Development
description: Build components that follow the existing design system
version: 2
suitedTo: [developer, frontend, designer]
---

# UI Development

Build components that follow the existing design system. Prefer composition over custom styles.

## Before building
1. Check if a similar component already exists
2. Read the design system tokens (colours, spacing, typography)
3. Confirm the design spec if one exists

## Building components
- Use design tokens, not raw values (`color: var(--color-primary)` not `color: #3b82f6`)
- Components should be self-contained — no implicit dependencies on parent structure
- Accessibility: interactive elements need focus states, aria-labels for icon-only buttons
- Mobile-first: design for 375px, scale up

## Before committing
- Test in both light and dark mode if applicable
- Check keyboard navigation
- Run the linter
