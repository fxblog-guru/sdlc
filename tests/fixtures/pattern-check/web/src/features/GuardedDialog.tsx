import { useDiscardGuard } from '../components/DiscardGuard';
export function GuardedDialog() {
  const guard = useDiscardGuard(true);
  return <Dialog onClose={guard}><Input name="title" /></Dialog>;
}
