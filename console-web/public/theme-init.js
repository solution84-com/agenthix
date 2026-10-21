// Runs before the first paint: the stored choice of dark (src/theme.ts keeps it). Light needs no attribute.
try {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
} catch {
  // Storage can be blocked; the page is then light until the switch is used.
}
