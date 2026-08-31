import { ContactList } from './ContactList'
import { UserSearch } from './UserSearch'
import { useT } from '@/lib/i18n'

export function ContactsPage() {
  const t = useT()
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">{t.contacts.title}</h1>
      <UserSearch />
      <ContactList />
    </div>
  )
}
