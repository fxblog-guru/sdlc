// The light app: renders the route's heading and a short list straight away.
const root = document.getElementById('root');
const h = document.createElement('h1');
h.textContent = `Route ${location.pathname}`;
const p = document.createElement('p');
p.textContent = 'Ten releases, rendered once, with nothing blocking the main thread for long.';
const ul = document.createElement('ul');
for (let i = 1; i <= 10; i += 1) {
  const li = document.createElement('li');
  li.textContent = `Release ${i}`;
  ul.append(li);
}
root.append(h, p, ul);
