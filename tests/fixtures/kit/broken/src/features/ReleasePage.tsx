import { cn } from '../lib/cn';
const PANEL_CLASS = 'grid gap-4 p-4';
export function ReleasePage({ busy }: { busy: boolean }) {
  return <div className={cn(PANEL_CLASS, busy && 'opacity-50', 'h-40 w-px', 'w-[123px]')}>x</div>;
}
