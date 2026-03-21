'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Search, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'

interface Notification {
  id: string
  type: 'error' | 'warning' | 'info'
  title: string
  message: string
  createdAt?: string
}

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const user = useAuthStore((s) => s.user)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      const data = await api.get<Notification[]>('/api/system/notifications')
      setNotifications(Array.isArray(data) ? data : [])
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const hasAlert = notifications.some((n) => n.type === 'error' || n.type === 'warning')
  const latest = notifications.slice(0, 5)

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'A'

  return (
    <header className="sticky top-0 z-30 h-16 glass border-b border-white/[0.06] flex items-center px-6 gap-4">
      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Szukaj..."
          className="w-56 h-9 pl-9 pr-3 rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/40 transition-all"
        />
      </div>

      {/* Notifications */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowDropdown((v) => !v)}
          className="relative w-9 h-9 rounded-xl glass-bright flex items-center justify-center hover:border-[var(--primary)]/30 transition-all"
        >
          <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
          {hasAlert && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
          )}
          {!hasAlert && notifications.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full gradient-brand" />
          )}
        </button>

        {showDropdown && (
          <div className="absolute top-full right-0 mt-2 w-80 glass-card rounded-2xl border border-white/10 shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Powiadomienia</h3>
              {notifications.length > 0 && (
                <span className="text-xs text-[var(--text-muted)]">{notifications.length} alertów</span>
              )}
            </div>

            {/* Body */}
            {latest.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 px-4">
                <CheckCircle2 className="w-8 h-8 text-green-400 opacity-80" />
                <p className="text-sm text-[var(--text-muted)]">Brak alertów</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {latest.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    {n.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    ) : n.type === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Bell className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-2.5 cursor-pointer group">
        <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center text-white text-sm font-bold glow-pink">
          {initials}
        </div>
        <div className="hidden md:block">
          <p className="text-sm font-medium text-[var(--text-primary)] leading-none">{user?.name ?? 'Admin'}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{user?.role ?? 'administrator'}</p>
        </div>
      </div>
    </header>
  )
}
