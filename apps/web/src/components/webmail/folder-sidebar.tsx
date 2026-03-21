'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Mail, Send, FileEdit, ShieldAlert, Trash2, Folder, Pencil,
} from 'lucide-react'

export interface WebmailFolder {
  id: string
  name: string
  role: string | null
  unreadEmails: number
  totalEmails: number
}

interface FolderSidebarProps {
  folders: WebmailFolder[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string) => void
  onCompose: () => void
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  inbox: Mail,
  sent: Send,
  drafts: FileEdit,
  junk: ShieldAlert,
  trash: Trash2,
}

const ROLE_LABELS: Record<string, string> = {
  inbox: 'Odebrane',
  sent: 'Wyslane',
  drafts: 'Szkice',
  junk: 'Spam',
  trash: 'Kosz',
}

function getFolderIcon(role: string | null): React.ElementType {
  if (role && ROLE_ICONS[role]) return ROLE_ICONS[role]
  return Folder
}

function getFolderLabel(folder: WebmailFolder): string {
  if (folder.role && ROLE_LABELS[folder.role]) return ROLE_LABELS[folder.role]
  return folder.name
}

export function FolderSidebar({ folders, selectedFolderId, onSelectFolder, onCompose }: FolderSidebarProps) {
  // Sort: inbox first, then sent, drafts, junk, trash, then others
  const roleOrder = ['inbox', 'sent', 'drafts', 'junk', 'trash']
  const sorted = [...folders].sort((a, b) => {
    const ai = a.role ? roleOrder.indexOf(a.role) : 999
    const bi = b.role ? roleOrder.indexOf(b.role) : 999
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col h-full">
      {/* Compose button */}
      <div className="p-3">
        <Button className="w-full" onClick={onCompose}>
          <Pencil className="w-4 h-4" /> Napisz
        </Button>
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sorted.map((folder) => {
          const Icon = getFolderIcon(folder.role)
          const label = getFolderLabel(folder)
          const active = folder.id === selectedFolderId

          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
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
              <span className="flex-1 text-left truncate">{label}</span>
              {folder.unreadEmails > 0 && (
                <span
                  className={cn(
                    'min-w-[20px] h-5 flex items-center justify-center rounded-md text-[10px] font-bold px-1.5',
                    active
                      ? 'gradient-brand text-white'
                      : 'bg-white/10 text-[var(--text-secondary)]'
                  )}
                >
                  {folder.unreadEmails > 99 ? '99+' : folder.unreadEmails}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
