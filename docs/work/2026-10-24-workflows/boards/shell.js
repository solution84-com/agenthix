// Shared frame for every board: the boards on the left, this page's sections on the right, the theme switch, diagrams.
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'

const ROOT = [{ f: 'decisions.html', k: '?', t: 'Questions and decisions' }]
const GROUPS = [
  { name: 'Architecture', items: [
    { f: 'problem.html', k: '1', t: 'Today: how a secret can leak' },
    { f: 'overview.html', k: '2', t: 'The design at a glance' },
    { f: 'library.html', k: '3', t: 'The workflow library' },
    { f: 'secrets.html', k: '4', t: 'Secret management' },
    { f: 'review.html', k: '5', t: 'Review and approval' },
    { f: 'run.html', k: '6', t: 'Running: a container for each step' },
    { f: 'steps.html', k: '7', t: 'Steps and progress' },
    { f: 'results.html', k: '8', t: 'What comes back' },
    { f: 'git.html', k: '9', t: 'GitHub through workflows' },
    { f: 'limits.html', k: '10', t: 'What it stops, and what it does not' },
  ]},
  { name: 'UI and UX', items: [
    { f: 'ui-where.html', k: 'U1', t: 'Where it lives in a project' },
    { f: 'ui-workflows.html', k: 'U2', t: 'The Workflows section' },
    { f: 'ui-workflow.html', k: 'U3', t: 'A workflow' },
    { f: 'ui-approval.html', k: 'U4', t: 'Approving a version' },
    { f: 'ui-run.html', k: 'U5', t: 'A run, step by step' },
    { f: 'ui-variables.html', k: 'U6', t: 'Secrets and variables' },
  ]},
  { name: 'GitHub integration', items: [
    { f: 'gh-today.html', k: 'G0', t: 'GitHub in hq today, numbered' },
    { f: 'gh-app.html', k: 'G1', t: 'Connecting GitHub to the organisation' },
    { f: 'gh-connect.html', k: 'G2', t: 'Connecting a repository' },
    { f: 'gh-workspace.html', k: 'G3', t: 'A connected workspace' },
  ]},
]

export const DECIDED = ['q1', 'q2', 'q3', 'q4', 'q5', 'gq1', 'gq2', 'gq3']
export const OPEN = [
    ]

const here = () => document.body.dataset.board || location.pathname.split('/').pop()
const href = f => '/files/' + f

function buildBoards() {
  const nav = document.createElement('nav'); nav.className = 'boards'
  const cur = here()
  let html = '<div class="title">Workflows</div><div class="root">'
  for (const r of ROOT) html += `<a class="${r.f === cur ? 'on' : ''}" href="${href(r.f)}"><span class="k">${r.k}</span>${r.t}</a>`
  html += '</div>'
  for (const g of GROUPS) {
    const open = g.items.some(i => i.f === cur) || !GROUPS.some(x => x.items.some(i => i.f === cur))
    html += `<details ${open ? 'open' : ''}><summary>${g.name} · ${g.items.length}</summary>`
    for (const i of g.items) html += `<a class="${i.f === cur ? 'on' : ''}" href="${href(i.f)}"><span class="k">${i.k}</span>${i.t}</a>`
    html += '</details>'
  }
  nav.innerHTML = html
  return nav
}

function buildToc(main) {
  const nav = document.createElement('nav'); nav.className = 'toc'
  const heads = [...main.querySelectorAll('h2, h3')]
  heads.forEach((h, n) => { if (!h.id) h.id = 's' + n })
  let html = '<div class="h">On this page</div>'
  for (const h of heads) html += `<a class="${h.tagName === 'H3' ? 'l3' : ''}" href="#${h.id}">${h.textContent}</a>`
  const cur = here()
  const mine = OPEN.filter(q => q.boards.includes(cur)).map(q => ({ id: q.id, label: q.id.toUpperCase(), t: q.q }))
  if (mine.length && cur !== 'decisions.html') {
    html += '<div class="items"><div class="h">This board\'s open questions</div>'
    for (const m of mine) html += `<a href="${href('decisions.html')}#${m.id}"><b>${m.label}</b>${m.t}</a>`
    html += '</div>'
  }
  nav.innerHTML = html
  const links = [...nav.querySelectorAll('a[href^="#"]')]
  const spy = () => {
    let at = heads[0]
    for (const h of heads) if (h.getBoundingClientRect().top < 120) at = h
    links.forEach(a => a.classList.toggle('on', at && a.getAttribute('href') === '#' + at.id))
  }
  addEventListener('scroll', spy, { passive: true }); spy()
  return nav
}


// A project's left panel in hq, as useProjectPlace.tsx builds it. data-on: the section shown; data-after: draw the
// proposed Workflows and Variables sections; data-needs: a "needs you" count on Workflows.
function projectPanel(el) {
  const on = el.dataset.on || '', after = el.dataset.after !== undefined, needs = el.dataset.needs
  const row = (id, label, count, cls = '') => `<a class="${id === on ? 'on' : ''} ${cls}">${label}${count ? `<span class="cnt">${count}</span>` : ''}</a>`
  const neu = (id, label, count) => row(id, label + ' <span class="neu">new</span>', count, 'new')
  el.classList.add('mnav')
  el.innerHTML = `<div class="logo"><i></i>${el.dataset.name || 'Website rebuild'}</div>${row('overview', 'Overview')}
  <div class="sec">Work</div>${row('tasks', 'Tasks', '12')}${row('boards', 'Boards', '2')}${row('timeline', 'Timeline')}
  <div class="sec">Agents at work</div>${row('runs', 'Runs', '1')}${row('automation', 'Automation', 'On')}${after ? neu('workflows', 'Workflows', needs ? needs + ' need you' : '4') : ''}${row('memory', 'Memory')}
  <div class="sec">Files</div>${row('files', 'Files')}${row('artefacts', 'Artefacts')}${row('knowledge', 'Knowledge')}${row('workspaces', 'Workspaces', '1')}${after ? neu('github', 'GitHub') : ''}
  <div class="sec">&nbsp;</div>${row('members', 'Members', '3')}${after ? neu('variables', 'Secrets and variables', '5') : ''}${row('settings', 'Settings')}`
}

let n = 0
async function draw(t) {
  mermaid.initialize({ startOnLoad: false, theme: t === 'light' ? 'default' : 'dark', flowchart: { curve: 'basis', htmlLabels: true }, securityLevel: 'strict' })
  for (const el of document.querySelectorAll('.mmd')) {
    try { const { svg } = await mermaid.render('m' + (n++), (window.SRC || {})[el.dataset.src]); el.innerHTML = svg
      const s = el.querySelector('svg'); if (s) { s.style.maxWidth = '100%'; s.style.height = 'auto' } } catch (e) { el.textContent = 'Diagram error: ' + e.message }
  }
}
function theme(t) {
  document.documentElement.dataset.theme = t
  document.querySelectorAll('.toggle button').forEach(b => b.classList.toggle('on', b.dataset.t === t))
  try { localStorage.setItem('as-theme', t) } catch (e) {}
  draw(t)
}

const main = document.querySelector('main')
const layout = document.createElement('div'); layout.className = 'layout'
main.replaceWith(layout)
const top = main.querySelector('.top')
if (top) { const tg = document.createElement('div'); tg.className = 'toggle'
  tg.innerHTML = '<button data-t="light">Light</button><button data-t="dark">Dark</button>'
  tg.querySelectorAll('button').forEach(b => b.onclick = () => theme(b.dataset.t)); top.appendChild(tg) }
layout.append(main)
document.querySelectorAll('.pnav').forEach(projectPanel)
layout.prepend(buildBoards()); layout.append(buildToc(main))
let t = 'light'; try { t = localStorage.getItem('as-theme') || 'light' } catch (e) {}
theme(t)
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
