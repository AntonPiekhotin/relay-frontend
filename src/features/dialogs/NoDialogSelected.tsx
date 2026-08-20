import { EmptyState } from '@/components/EmptyState'

export function NoDialogSelected() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        title="Pick a conversation"
        hint="Choose one on the left, or find someone in Contacts to start a new one."
      />
    </div>
  )
}
