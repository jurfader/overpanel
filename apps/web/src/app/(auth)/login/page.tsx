'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { ApiError } from '@/lib/api'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    const email = form.get('email') as string
    const password = form.get('password') as string

    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message === 'Invalid credentials' ? 'Nieprawidłowy email lub hasło' : err.message)
      } else {
        setError('Błąd połączenia z serwerem')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E91E8C]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#9B26D9]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-4 glow-brand">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor">
              <path d="M12 2L8.5 8.5H2L7 13l-2 7 7-4.5L19 20l-2-7 5-4.5h-6.5L12 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold gradient-brand-text">OVERPANEL</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">VPS Control Panel</p>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-white/[0.08]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Zaloguj się</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">Wprowadź dane dostępowe</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              name="email"
              label="Email"
              type="email"
              placeholder="admin@example.com"
              icon={<Mail className="w-4 h-4" />}
              required
              autoComplete="email"
            />

            <div className="relative">
              <Input
                name="password"
                label="Hasło"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4" />}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 bottom-2.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              {!isLoading && 'Zaloguj się'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          OVERPANEL v0.1.0 · Powered by OVERMEDIA
        </p>
      </div>
    </div>
  )
}
