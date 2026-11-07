import { ConfirmDialog } from '../components/ui/dialog';
import { deleteRelease } from '../api';
export function ReleaseRow({ id, name }: { id: string; name: string }) {
  return <ConfirmDialog title={`Delete ${name}?`} confirm="Delete release" onConfirm={() => deleteRelease(id)} />;
}
