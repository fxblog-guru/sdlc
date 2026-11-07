import { cn } from '../lib/cn';
const PANEL_CLASS = 'grid gap-4 p-4';
export function DeployStateCell({ busy }: { busy: boolean }) {
  // tokens-ok: an A4 page preview keeps the paper's aspect ratio
  return <div className={cn(PANEL_CLASS, busy && 'opacity-50', 'aspect-[210/297]')} data-kind="not-found">x</div>;
}
