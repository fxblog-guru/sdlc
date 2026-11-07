import { deleteRelease } from '../api';
export function ReleaseRow({ id }: { id: string }) {
  return <button onClick={() => deleteRelease(id)}>Delete</button>;
}
