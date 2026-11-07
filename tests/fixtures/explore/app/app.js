// A tiny app with one dialog form, a filter, and a role switch. good.html builds every behaviour
// row; bad.html sets BAD and ships release-management's defects: Esc and Back drop typed input,
// focus is not returned to the opener, the filter is not in the URL, a double click saves twice,
// and a viewer still sees "New release".
/* global document, window, history, location, fetch */
const BAD = window.BAD === true;
const params = new URLSearchParams(location.search);
const role = document.cookie.includes('role=viewer') ? 'viewer' : 'member';
const main = document.querySelector('main');

main.innerHTML = `
  <h1>Releases</h1>
  <label>Filter <input id="filter" name="q"></label>
  ${role === 'viewer' && !BAD ? '<p id="denied">Creating a release needs a Member.</p>' : '<button id="new" type="button">New release</button>'}
  <ul id="list"><li>Sprint 220</li><li>Hotfix 3</li></ul>`;

const filter = document.getElementById('filter');
filter.value = BAD ? '' : params.get('q') ?? '';
filter.addEventListener('input', () => {
  if (BAD) return;
  const u = new URL(location.href);
  if (filter.value) u.searchParams.set('q', filter.value); else u.searchParams.delete('q');
  history.replaceState(null, '', u);
});

let opener = null;
let dialog = null;
function close() {
  dialog?.remove();
  dialog = null;
  if (!BAD && opener) opener.focus();
  if (!BAD && new URL(location.href).searchParams.has('dialog')) history.back();
}
function dirty() { return !!dialog && dialog.querySelector('#name').value !== ''; }
function askOrClose() {
  if (BAD || !dirty()) { close(); return; }
  if (dialog.querySelector('[data-testid="discard-bar"]')) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-testid', 'discard-bar');
  bar.innerHTML = 'Discard changes? <button type="button" id="keep">Keep editing</button> <button type="button" id="discard">Discard</button>';
  dialog.querySelector('footer').replaceWith(bar);
  bar.querySelector('#keep').focus();
  bar.querySelector('#discard').addEventListener('click', () => { opener = opener ?? null; dialog.remove(); dialog = null; if (opener) opener.focus(); });
}
function open() {
  opener = document.getElementById('new');
  dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'New release');
  dialog.innerHTML = `<label>Name <input id="name"></label><button type="button" aria-label="Close" id="x">×</button>
    <footer><button type="button" id="save">Save</button><button type="button" id="cancel">Cancel</button></footer>`;
  document.body.append(dialog);
  dialog.querySelector('#name').focus();
  dialog.querySelector('#x').addEventListener('click', askOrClose);
  dialog.querySelector('#cancel').addEventListener('click', askOrClose);
  let busy = false;
  dialog.querySelector('#save').addEventListener('click', () => {
    if (busy && !BAD) return;
    busy = true;
    fetch('/api/releases', { method: 'POST', body: dialog.querySelector('#name').value });
  });
  if (!BAD) history.pushState({ dialog: 1 }, '', `${location.pathname}${location.search ? `${location.search}&` : '?'}dialog=new`);
}
document.getElementById('new')?.addEventListener('click', open);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dialog) askOrClose(); });
window.addEventListener('popstate', () => {
  if (!dialog) return;
  if (dirty() && !BAD) { history.pushState({ dialog: 1 }, '', location.href.includes('dialog=') ? location.href : `${location.href}${location.search ? '&' : '?'}dialog=new`); askOrClose(); } else close();
});
