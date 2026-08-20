import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/lib/api/client'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AppLayout } from '@/features/shell/AppLayout'
import { ChatPane } from '@/features/chat/ChatPane'
import { NoDialogSelected } from '@/features/dialogs/NoDialogSelected'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { CallLogPage } from '@/features/calls/CallLogPage'
import { GroupCreatePage } from '@/features/groups/GroupCreatePage'
import { GroupInfoPage } from '@/features/groups/GroupInfoPage'
import { ProfilePage } from '@/features/profile/ProfilePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will not become a 2xx by asking again — and a 401 has already been through the
      // client's one refresh and one retry by the time it surfaces here.
      retry: (failureCount, error) => !(error instanceof ApiError && error.isClient) && failureCount < 2,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<NoDialogSelected />} />
              <Route path="d/:dialogId" element={<ChatPane />} />
              <Route path="d/:dialogId/info" element={<GroupInfoPage />} />
              <Route path="groups/new" element={<GroupCreatePage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="calls" element={<CallLogPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
