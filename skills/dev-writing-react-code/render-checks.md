# Render checks — the reference for `dev-writing-react-code` §Render budgets

Two release-management bugs shipped through every gate and surfaced only as "slow tests":

- **A remount.** `ThreadView` rendered `comments.map((c, i) => [divider, <Comment key={c.id}/>])` —
  an array per comment. React keys the outer arrays by index, so prepending an older window shifted
  every index and remounted every comment on screen, losing an edit in progress. `flatMap` gives one
  flat keyed list. A unit test saw only that loading the older window took seconds in jsdom.
- **A measure on every render.** `ClampedBody` ran its layout effect with `[children]` as the
  dependency. `children` is a new element on every parent render, so each comment re-read
  `getComputedStyle` — a forced style pass — on every render of the thread: 100 measures to load a
  window of 40 comments.

Both are visible as a count, cheaply, in a unit test. A timing is not: it moves with the machine,
and the fix people reach for is a longer timeout.

## 1. Render count with `<Profiler>`

```tsx
// src/test/renderCount.tsx
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';

/** Counts commits of a subtree, split by phase: mount, update, nested-update. */
export function renderCounter() {
  const counts = { mount: 0, update: 0, 'nested-update': 0 };
  const onRender: ProfilerOnRenderCallback = (_id, phase) => { counts[phase] += 1; };
  const Wrap = ({ id, children }: { id: string; children: ReactNode }) => (
    <Profiler id={id} onRender={onRender}>{children}</Profiler>
  );
  return { counts, Wrap, reset: () => { counts.mount = 0; counts.update = 0; counts['nested-update'] = 0; } };
}
```

`<Profiler>` runs in development builds, which is what Vitest and Jest use. Wrap **one row** to
count that row's commits; wrap the list to count the list's.

## 2. The long-list test: one change, one row re-rendered, nothing remounted

```tsx
it('loading an older window keeps the comments on screen mounted and renders each once', async () => {
  const mounts = new Map<string, number>();
  const renders = new Map<string, number>();
  // A test-only probe in the row: count by id, not by position.
  vi.spyOn(rowProbe, 'onRender').mockImplementation((id, phase) => {
    const m = phase === 'mount' ? mounts : renders;
    m.set(id, (m.get(id) ?? 0) + 1);
  });

  render(<ThreadView releaseId="rel_1" />);
  await screen.findAllByRole('article');
  const shown = screen.getAllByRole('article')[0];
  mounts.clear();
  renders.clear();

  await loadOlderWindow();                                   // the user's action under test

  expect(shown.isConnected).toBe(true);                      // the same DOM node: not remounted
  for (const id of idsOnScreenBefore) expect(mounts.get(id)).toBeUndefined();
  for (const id of idsOnScreenBefore) expect(renders.get(id) ?? 0).toBeLessThanOrEqual(1);
});
```

The `rowProbe` is a module the row component calls from a `<Profiler>` around itself in
development only — or wrap the row in the test with `renderCounter().Wrap` when the list takes a
`renderItem`. Either way the assertion is a number per row, keyed by the row's id.

Hold three things on any list that can grow:

| Assert | Catches |
|---|---|
| the DOM node of a row on screen before the change `isConnected` and is the same node after | a remount: a key by index, an array per item, a component defined inside a render |
| each unchanged row renders at most once per user action | a new object or callback prop every render, a context that changes on every keystroke |
| one edited row → `update` count 1 on that row, 0 on its siblings | a list-level state that should be row-level |

## 3. The measure-every-render test

Any component that reads layout (`getComputedStyle`, `getBoundingClientRect`, `scrollHeight`,
`offsetWidth`) in an effect gets a test that counts the reads across a parent re-render with the
same content:

```tsx
const style = vi.spyOn(window, 'getComputedStyle');
const measures = () => style.mock.calls.filter(([el]) => el instanceof HTMLElement && el.hasAttribute('data-clamped')).length;

const { rerender } = render(<ClampedText content={ast}>{lines(12)}</ClampedText>);
const first = measures();
rerender(<ClampedText content={ast}>{lines(12)}</ClampedText>);  // new children, same content
expect(measures()).toBe(first);                                  // no new measure
```

The fix it forces: the effect depends on a stable value that changes only when the content does
(the parsed AST, an id, a version), never on `children`.

## 4. On the built app

Render counts guard the component; `web-perf.mjs` guards the route — JS transferred, LCP, TBT and
long tasks against `DEV-PROFILE §Quality gates`, on the production build, before hand-over:

```bash
npm run build
node <root>/scripts/web-perf.mjs --dist <build dir> --route <name>=<path> … --budget <the profile's numbers>
```

A long-task count that rises with a list's length is the same bug as a failing render-count test,
seen from the browser.

## 5. When a test is slow

Slow is a measurement. Before touching a timeout, follow
`.claude/skills/dev-stage-protocol/slow-tests.md`.
