# Testing

Part of the unit's design spec: see [the index](README.md).

## Testing

- **New behaviour (each area's *New behaviour this design needs*)** is built test-first, with integration tests against the real database, as hq's testing
  rules require.
- **Screens** get component tests where they hold logic (layout choice, panel state, pin ordering) and end-to-end
  tests for the main paths: start a conversation from a project, switch layouts, open a tool, open and act in each
  panel, pin and unpin, and the mobile drawer and Project page at 375px.
- Both themes are checked, because light becomes the default.
- The unit writes its stories and scenarios for this behaviour when it closes, and tags the tests that cover them.
