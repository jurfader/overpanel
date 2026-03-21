'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth'
import { api, ApiError } from '@/lib/api'
import { User, Lock, Shield, Mail, Eye, EyeOff } from 'lucide-react'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      return setError('Nowe hasła nie są identyczne')
    }
    if (newPassword.length < 8) {
      return setError('Nowe hasło musi mieć co najmniej 8 znaków')
    }

    setLoading(true)
    try {
      await api.post('/api/settings/change-password', {
        currentPassword: oldPassword,
        newPassword,
      })
      setSuccess('Hasło zostało zmienione pomyślnie')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas zmiany hasła')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen">
      <Topbar title="Profil" subtitle="Informacje o koncie i bezpieczeństwo" />

      <div className="p-6 max-w-2xl space-y-5">
        {/* User info card */}
        <Card className="p-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center glow-pink flex-shrink-0">
              <span className="text-xl font-bold text-white">{initials}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{user.name}</h2>
                <Badge variant={user.role === 'admin' ? 'brand' : 'secondary'}>
                  {user.role === 'admin' ? 'Administrator' : 'Klient'}
                </Badge>
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-1">{user.email}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">ID: {user.id}</p>
            </div>
          </div>

          {/* Info grid */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-[var(--primary)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Imię</p>
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">E-mail</p>
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Rola</p>
                <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{user.role}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Change password card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Zmiana hasła</h3>
              <p className="text-xs text-[var(--text-muted)]">Użyj silnego hasła (min. 8 znaków)</p>
            </div>
          </div>

          {success && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              {success}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {/* Current password */}
            <div className="relative">
              <Input
                label="Aktualne hasło"
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-[34px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* New password */}
            <div className="relative">
              <Input
                label="Nowe hasło"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-[34px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Confirm password */}
            <Input
              label="Potwierdź nowe hasło"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <div className="pt-1">
              <Button type="submit" loading={loading} className="w-full sm:w-auto">
                {!loading && 'Zmień hasło'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
