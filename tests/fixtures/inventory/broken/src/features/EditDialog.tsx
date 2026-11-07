import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
export function EditDialog({ save }: { save: { mutate: () => void } }) {
  return (
    <Dialog open onOpenChange={() => {}} title="Edit">
      <form onSubmit={() => save.mutate()}>
        <p role="alert">Fill in the name.</p>
        <Button type="submit">Save</Button>
      </form>
    </Dialog>
  );
}
