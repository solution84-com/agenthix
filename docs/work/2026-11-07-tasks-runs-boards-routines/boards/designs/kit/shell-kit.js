// The shell, drawn once (shared by every design): rail, project menu, screen bar, chat bar, phone top bar.
(function () {
  const I = (id, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const RAIL = [
    [['home', 'Home'], ['chat', 'Chat'], ['user', 'Your space']],
    [['projects', 'Projects'], ['boards', 'Boards'], ['yourtasks', 'Your tasks'], ['workspaces', 'Workspaces'], ['routines', 'Routines'], ['workroom', 'Workrooms']],
    [['bot', 'Agents'], ['library', 'Library']],
  ];
  function rail(on, runsOn, quiet) {
    const groups = RAIL.map(g => g.map(([id, name]) =>
      `<a class="ri${on === id ? ' on' : ''}" title="${name}" aria-label="${name}">${I(id)}</a>`).join('')).join('<div class="sep"></div>');
    return `<div class="org" title="Fernhill">F</div><div class="nav">${groups}</div>
      <div class="foot">
        <a class="ri" title="Notifications" aria-label="Notifications">${I('bell')}</a>
        <a class="ri${runsOn ? ' on' : ''}" title="${quiet ? 'Runs' : 'Runs · 3 running'}" aria-label="${quiet ? 'Runs' : 'Runs, 2 need you, 3 running'}">${I('activity')}${quiet ? '' : '<span class="badge">2</span>'}</a>
        <span class="pv" style="--h:28;width:28px;height:28px" title="Sam Okafor">S</span>
      </div>`;
  }
  const MENU = [
    [null, [['overview', 'Overview'], ['convs', 'Conversations']]],
    ['Work', [['tasks', 'Tasks', '33'], ['boards', 'Boards', '6'], ['sprints', 'Sprints', '4'], ['timeline', 'Timeline']]],
    ['Agents at work', [['workroom', 'Workroom', '3 running', 'live'], ['runs', 'Runs'], ['routines', 'Routines', '5'], ['workflows', 'Workflows'], ['skills', 'Skills']]],
    ['Files', [['folder', 'Files'], ['artefacts', 'Artefacts'], ['knowledge', 'Knowledge'], ['workspaces', 'Workspaces']]],
    ['Project', [['members', 'Members', '5'], ['github', 'GitHub'], ['secrets', 'Secrets and variables'], ['settings', 'Settings'], ['memory', 'Memory']]],
  ];
  function pmenu(on, quiet) {
    const body = MENU.map(([g, items]) => (g ? `<div class="pm-g">${g}</div>` : '') + items.map(([id, name, count, tone]) => {
      if (quiet && tone === 'live') count = null;
      return `<a class="pm-i${on === id ? ' on' : ''}">${I(id)}<span>${name}</span>${count ? `<em class="${tone || ''}">${count}</em>` : ''}</a>`; }).join('')).join('');
    return `<div class="pm-head"><span class="pa" style="background:hsl(152 55% 44%)">W</span><b>Website relaunch</b>${I('down', 's14 mu')}<a class="ib" title="Pin Website relaunch" aria-label="Pin Website relaunch">${I('pin', 's14')}</a><a class="ib" title="Hide Website relaunch's menu" aria-label="Hide Website relaunch's menu">${I('panelclose')}</a></div><div>${body}</div>`;
  }
  // Breadcrumbs always start at Home; all but the last are links; "/" between.
  function crumbs(spec) {
    const parts = ['Home'].concat(spec.split('|'));
    return parts.map((p, i) => (i ? '<span class="sl">/</span>' : '') + (i === parts.length - 1 ? `<span class="cur">${p}</span>` : `<a>${p}</a>`)).join('');
  }
  document.querySelectorAll('.rail[data-on]').forEach(el => { el.innerHTML = rail(el.dataset.on, el.hasAttribute('data-runs'), el.hasAttribute('data-quiet')); });
  document.querySelectorAll('.pmenu[data-on]').forEach(el => { el.innerHTML = pmenu(el.dataset.on, el.hasAttribute('data-quiet')); });
  document.querySelectorAll('.sbar[data-crumbs]').forEach(el => { el.insertAdjacentHTML('afterbegin', crumbs(el.dataset.crumbs)); });
  document.querySelectorAll('.dock').forEach(el => { el.innerHTML = `<a class="ri" title="Chat" aria-label="Chat">${I('chat')}</a>`; });
  // The phone's top bar (decided 7 Nov): menu (or Back), the title, chat, and one ⋯ that holds the screen's actions. Notifications
  // and Runs are in the menu (☰) drawer, so ☰ shows a dot when something needs the person. A form is a focused page:
  // ✕ (Cancel), the title, and one filled button (data-create="Create").
  //   <div class="mtop" data-title="Tasks" [data-under=""] [data-back] [data-form data-create="Create"] [data-quiet]></div>
  // data-more-open: the frame draws the ⋯ open (its popover is a .mpop in the phone), so the ⋯ shows the selected fill.
  document.querySelectorAll('.mtop[data-title]').forEach(el => {
    if (el.hasAttribute('data-more-open')) el.classList.add('more-open');
    const back = el.hasAttribute('data-back'), form = el.hasAttribute('data-form'), quiet = el.hasAttribute('data-quiet');
    const lead = form
      ? `<button class="ib" aria-label="Cancel">${I('x', 's18')}</button>`
      : `<button class="ib" aria-label="${back ? 'Back' : quiet ? 'Open menu' : 'Open menu, 5 need you'}" style="position:relative">${I(back ? 'left' : 'menu', 's18')}${!back && !quiet ? '<span class="mdot"></span>' : ''}</button>`;
    const title = `<div class="tt"><b>${el.dataset.title}</b>${el.dataset.under ? `<span>${el.dataset.under}</span>` : ''}</div>`;
    const end = form
      ? `<button class="mcreate">${el.dataset.create || 'Create'}</button>`
      : `<button class="ib" aria-label="Chat">${I('chat', 's18')}</button><button class="ib" aria-label="Actions for this screen">${I('more', 's18')}</button>`;
    el.innerHTML = lead + title + end;
  });
})();