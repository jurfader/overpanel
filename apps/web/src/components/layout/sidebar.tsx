'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Globe,
  Database,
  Shield,
  Users,
  Cloud,
  Clock,
  HardDrive,
  Terminal,
  Network,
  Settings,
  LogOut,
  ChevronRight,
  Box,
  FolderOpen,
  UserCog,
  Container,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'

type NavItem = { href: string; label: string; icon: React.ElementType; adminOnly?: boolean }
type NavGroup = { group: string; items: NavItem[]; adminOnly?: boolean }

const navItems: NavGroup[] = [
  {
    group: 'Główne',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/sites', label: 'Strony WWW', icon: Globe },
      { href: '/databases', label: 'Bazy danych', icon: Database },
      { href: '/ssl', label: 'Certyfikaty SSL', icon: Shield },
      { href: '/wordpress', label: 'WordPress', icon: Box },
    ],
  },
  {
    group: 'Narzędzia',
    items: [
      { href: '/dns', label: 'DNS / Cloudflare', icon: Cloud },
      { href: '/docker', label: 'Docker', icon: Container, adminOnly: true },
      { href: '/files', label: 'Menedżer plików', icon: FolderOpen },
      { href: '/ftp', label: 'FTP / SFTP', icon: UserCog },
      { href: '/cron', label: 'Cron Jobs', icon: Clock },
      { href: '/backups', label: 'Backup', icon: HardDrive },
      { href: '/logs', label: 'Logi', icon: Terminal },
      { href: '/firewall', label: 'Firewall', icon: Network },
    ],
  },
  {
    group: 'Administracja',
    adminOnly: true,
    items: [
      { href: '/terminal', label: 'Terminal', icon: Terminal },
      { href: '/users', label: 'Użytkownicy', icon: Users },
      { href: '/settings', label: 'Ustawienia', icon: Settings },
      { href: '/update', label: 'Aktualizacje', icon: RefreshCw },
    ],
  },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--surface)] border border-white/10"
        aria-label="Menu"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`glass fixed left-0 top-0 h-screen w-60 flex flex-col z-40 border-r border-white/[0.06] transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            {/* Logo icon */}
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center glow-pink flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M12 2L8.5 8.5H2L7 13l-2 7 7-4.5L19 20l-2-7 5-4.5h-6.5L12 2z" />
              </svg>
            </div>
            <div>
              <span className="text-base font-bold gradient-brand-text">OVERPANEL</span>
              <p className="text-[10px] text-[var(--text-muted)] -mt-0.5">VPS Control Panel</p>
            </div>
            {/* Close button on mobile */}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden ml-auto w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navItems
            .filter((group) => !group.adminOnly || user?.role === 'admin')
            .map((group) => (
            <div key={group.group}>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest px-3 mb-2">
                {group.group}
              </p>
              <ul className="space-y-0.5">
                {group.items
                  .filter((item) => !item.adminOnly || user?.role === 'admin')
                  .map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                          active
                            ? 'gradient-subtle text-[var(--text-primary)] border border-[var(--primary)]/20'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 flex-shrink-0 transition-colors',
                            active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                          )}
                        />
                        <span className="flex-1">{label}</span>
                        {active && <ChevronRight className="w-3 h-3 text-[var(--primary)] opacity-60" />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="px-3 py-4 border-t border-white/[0.06] space-y-1">
          {user && (
            <Link
              href="/profile"
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                pathname.startsWith('/profile')
                  ? 'gradient-subtle text-[var(--text-primary)] border border-[var(--primary)]/20'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
              )}
            >
              <div className="w-5 h-5 rounded-full gradient-brand flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="flex-1 truncate">{user.name}</span>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4" />
            <span>Wyloguj się</span>
          </button>
        </div>
      </aside>
    </>
  )
}
