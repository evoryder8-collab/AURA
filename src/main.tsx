import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineRuntimeProvider } from '@/app/providers/OfflineRuntimeProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AppRouter } from '@/app/router/AppRouter'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineRuntimeProvider>
          <AppRouter />
        </OfflineRuntimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
