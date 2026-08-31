import { EmptyState } from '@/components/EmptyState'
import { useT } from '@/lib/i18n'

export function NoDialogSelected() {
  const t = useT()
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState title={t.dialogs.pickTitle} hint={t.dialogs.pickHint} />
    </div>
  )
}
