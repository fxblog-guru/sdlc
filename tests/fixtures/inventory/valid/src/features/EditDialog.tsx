import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { ErrorSummary, Field } from '../components/ui/field';
export function EditDialog({ save, dirty, errors }: { save: { mutate: () => void; isPending: boolean }; dirty: boolean; errors: Record<string, string> }) {
  return (
    <Dialog open onOpenChange={() => {}} title="Edit" dirty={dirty}>
      <form noValidate onSubmit={() => save.mutate()}>
        <ErrorSummary errors={errors} />
        <Field label="Name" />
        <Button type="submit" mutates pending={save.isPending}>Save</Button>
      </form>
    </Dialog>
  );
}
