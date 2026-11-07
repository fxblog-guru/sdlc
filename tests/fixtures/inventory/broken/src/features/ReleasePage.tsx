const BTN = 'h-control-sm rounded-md border px-3';
const RELEASE_COPY = { cancel: 'Cancel', title: 'Releases' };
function Skeleton() {
  return <div className="h-4 animate-pulse" />;
}
function StatusBadge({ s }: { s: string }) {
  return <span className={s === 'ok' ? 'bg-tint-success text-success' : 'bg-tint-danger'}>{s}</span>;
}
export function ReleasePage({ at }: { at: string }) {
  return (
    <section>
      <Skeleton />
      <StatusBadge s="ok" />
      <p>{at.slice(0, 16)} · {new Date(at).toLocaleDateString()}</p>
      <div role="menu"><button role="menuitem" onClick={() => void 0} className={BTN}>{RELEASE_COPY.cancel}</button></div>
      <input className="h-control-md" />
      <table><tbody /></table>
      <button type="button" onClick={() => void 0} aria-label="x" />
    </section>
  );
}
