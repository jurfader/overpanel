import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@overpanel/shared'
import { api } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const data = await api.post<{ user: AuthUser; accessToken: string }>('/api/auth/login', {
            email,
            password,
          })
          set({ user: data.user, token: data.accessToken, isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        try { await api.post('/api/auth/logout') } catch {}
        set({ user: null, token: null })
      },

      fetchMe: async () => {
        try {
          const user = await api.get<AuthUser>('/api/auth/me')
          set({ user })
        } catch {
          set({ user: null, token: null })
        }
      },
    }),
    {
      name: 'overpanel-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)
