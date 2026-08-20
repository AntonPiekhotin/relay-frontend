import { ContactList } from './ContactList'
import { UserSearch } from './UserSearch'

export function ContactsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Contacts</h1>
      <UserSearch />
      <ContactList />
    </div>
  )
}
