import * as Menu from '@radix-ui/react-dropdown-menu';
export const DropdownMenu = Menu.Root;
export function DropdownMenuContent() {
  return <Menu.Content className="max-h-menu min-w-menu rounded-md" />;
}
