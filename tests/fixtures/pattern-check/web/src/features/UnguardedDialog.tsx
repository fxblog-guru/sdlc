// The release-management defect: a dialog with input and no discard guard.
export function UnguardedDialog() { return <Dialog><Textarea name="notes" /></Dialog>; }
