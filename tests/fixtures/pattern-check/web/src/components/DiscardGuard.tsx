// The shared guard. Defines <Dialog> wrappers and <Input> handling; excluded from its own obligation.
export function useDiscardGuard(dirty: boolean) { return { dirty }; }
export function DiscardBar() { return null; }
