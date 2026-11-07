/**
 * The task dependency graph, shared by the linter (E020/E021) and status.mjs --ready.
 *
 * One implementation, for the same reason doc.mjs has one hash: if the linter and the board
 * disagreed about what a cycle is, one of them would be lying, and nobody could tell which.
 */

const TASK_ID = /TASK-\d{3,}/g;

/** §10 task status. `in_progress` is accepted in progress.md as a spelling of `in-progress`. */
export const TASK_STATUS = ['todo', 'in-progress', 'blocked', 'done'];
/** What the reviewed plan may say (§8.1): execution status lives in progress.md. */
export const PLAN_STATUS = ['todo', 'blocked'];

export function progressStatus(cell) {
  const v = String(cell ?? '').replace(/[`*]/g, '').trim().toLowerCase();
  return v === 'in_progress' ? 'in-progress' : v;
}

/**
 * The rows of `implementation/<slug>/progress.md`: the first markdown table whose header has a
 * Task and a Status column, in file order. Several rows for one task are allowed — an implementer
 * appends — and the last one wins. `line` is 1-based in the file.
 *
 * An optional `Actual` column records the time a done task took (`5h`, `90min`), for bench.mjs.
 *
 * @returns {{ task: string, status: string, commit: string, note: string, actual: string, line: number }[]}
 */
export function readProgress(text) {
  const rows = [];
  let header = null;
  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      if (header && rows.length) header = 'done';
      return;
    }
    if (header === 'done') return;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!header) {
      const h = cells.map((c) => c.toLowerCase());
      if (h.includes('task') && h.includes('status')) header = h;
      return;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
    const get = (name) => cells[header.indexOf(name)] ?? '';
    const clean = (c) => c.replace(/`/g, '').trim();
    rows.push({ task: clean(get('task')), status: progressStatus(get('status')), commit: clean(get('commit')), note: clean(get('note')), actual: clean(get('actual')), line: i + 1 });
  });
  return rows;
}

/** The last progress row per task, as a Map task → row. */
export function latestProgress(rows) {
  return new Map(rows.map((r) => [r.task, r]));
}

/** The TASK ids named in a `Depends on` cell. `none`, `—` and prose around the ids are ignored. */
export function dependsOn(cell) {
  return [...new Set(String(cell ?? '').match(TASK_ID) ?? [])];
}

/**
 * The cycles a depth-first search meets (one per back edge, so a graph with any cycle reports at
 * least one), each once, as a closed path starting at its smallest id:
 * `['TASK-001', 'TASK-004', 'TASK-002', 'TASK-001']`. A self-dependency is a cycle of length one.
 * Edges to ids not in the graph are ignored here; they are unknown ids, not cycles.
 *
 * @param {Map<string, string[]>} graph id → the ids it depends on
 */
export function findCycles(graph) {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map([...graph.keys()].map((k) => [k, WHITE]));
  const stack = [];
  const seen = new Set();
  const cycles = [];

  const visit = (id) => {
    colour.set(id, GREY);
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      if (!graph.has(dep)) continue;
      if (colour.get(dep) === GREY) {
        const loop = stack.slice(stack.indexOf(dep));
        const key = canonical(loop);
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(key.split(' '));
        }
      } else if (colour.get(dep) === WHITE) {
        visit(dep);
      }
    }
    stack.pop();
    colour.set(id, BLACK);
  };

  for (const id of [...graph.keys()].sort()) {
    if (colour.get(id) === WHITE) visit(id);
  }
  return cycles;
}

/** Rotate a loop to start at its smallest id, and close it. */
function canonical(loop) {
  const start = loop.indexOf([...loop].sort()[0]);
  const rotated = [...loop.slice(start), ...loop.slice(0, start)];
  return [...rotated, rotated[0]].join(' ');
}

/**
 * Group the tasks that are not done into waves: wave 1 is every task whose dependencies are all
 * done; wave N is every task whose dependencies are done or in an earlier wave.
 *
 * A task that never becomes ready — it sits on a cycle, depends on an unknown id, or depends on a
 * task that does either — is returned in `stuck`, never silently dropped.
 *
 * @param {{ id: string, status: string, depends_on?: string[] }[]} tasks
 */
export function planWaves(tasks) {
  const known = new Set(tasks.map((t) => t.id));
  const unknown = [];
  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      if (!known.has(dep)) unknown.push({ task: t.id, dep });
    }
  }

  const graph = new Map(tasks.map((t) => [t.id, t.depends_on ?? []]));
  const cycles = findCycles(graph);

  const satisfied = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  let remaining = tasks.filter((t) => t.status !== 'done');
  const waves = [];
  while (remaining.length) {
    const wave = remaining.filter((t) => (t.depends_on ?? []).every((d) => satisfied.has(d)));
    if (!wave.length) break;
    waves.push(wave);
    for (const t of wave) satisfied.add(t.id);
    remaining = remaining.filter((t) => !wave.includes(t));
  }

  return { waves, stuck: remaining, cycles, unknown };
}
