import { cva } from 'class-variance-authority';
export const buttonVariants = cva('inline-flex h-control-md px-4', { variants: { variant: { primary: 'bg-primary text-primary-fg', 'danger-outline': 'border border-danger' } }, defaultVariants: { variant: 'primary' } });
export function Button(props: { className?: string }) {
  return <button type="button" className={buttonVariants({})} {...props} />;
}
