'use client'

import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Shield } from 'lucide-react'

const PATH_TO_SECTION: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/sites': 'sites',
  '/databases': 'databases',
  '/ssl': 'ssl',
  '/wordpress': 'wordpress',
  '/dns': 'dns',
  '/docker': 'docker',
  '/files': 'files',
  '/ftp': 'ftp',
  '/cron': 'cron',
  '/backups': 'backups',
  '/logs': 'logs',
}

// Admin-only pages — clients never see these
const ADMIN_ONLY = ['/terminal', '/users', '/settings', '/update', '/firewall']

export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)

  if (!user) return <>{children}</>

  // Admin always passes
  if (user.role === 'admin') return <>{children}</>

  // Block admin-only pages for clients
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    return <AccessDenied />
  }

  // If no permissions set (null) = full access (backward compatible)
  if (!user.permissions) return <>{children}</>

  // Check section permission
  const section = Object.entries(PATH_TO_SECTION).find(([path]) => pathname.startsWith(path))?.[1]
  if (section && !user.permissions.sections?.includes(section as any)) {
    return <AccessDenied />
  }

  return <>{children}</>
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <Shield className="w-7 h-7 text-red-400" />
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        Brak dostępu do tej sekcji. Skontaktuj się z administratorem.
      </p>
    </div>
  )
}
