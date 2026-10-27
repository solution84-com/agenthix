/**
 * The PDF viewer page's header policy (spec part 2 *Where it runs*, part 6 T7). The page runs pdf.js, so unlike a
 * ticket's answer it may run script — but only its own, from the files address, which holds no session of hq's. It
 * may be framed by hq's origin alone, reads nothing but its own origin (its files and the ticket it was given), and
 * gets no eval of any kind. pdf.js's worker alone may compile WebAssembly, for its image decoders.
 */
export const VIEWER_ROOT = '/viewer/pdf'

export function viewerPagePolicy(appOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "worker-src 'self'",
    "connect-src 'self'",
    'img-src blob: data:',
    "style-src 'self'",
    'font-src data:',
    `frame-ancestors ${appOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
    // As the frame's own sandbox, should the page ever be opened on its own: no popups, forms or navigating the top.
    'sandbox allow-scripts allow-same-origin',
  ].join('; ')
}

/** A dedicated worker takes its policy from its own answer, not from the page that started it. */
export const VIEWER_WORKER_POLICY = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'"

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The page: no inline script or style. It names hq's origin, the one window its reports go to; the file to show comes
 * in the address's fragment, which a browser never sends, so no log can keep it.
 */
export function viewerPage(appOrigin: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<meta name="report-to-origin" content="${escapeAttribute(appOrigin)}">`,
    '<title>PDF</title>',
    `<link rel="stylesheet" href="${VIEWER_ROOT}/viewer.css">`,
    `<script type="module" src="${VIEWER_ROOT}/viewer.js"></script>`,
    '</head>',
    '<body></body>',
    '</html>',
    '',
  ].join('\n')
}
