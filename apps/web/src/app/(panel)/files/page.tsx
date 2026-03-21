'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { api, ApiError } from '@/lib/api'
import {
  Folder,
  File,
  FileCode,
  FileImage,
  FileArchive,
  ChevronRight,
  RefreshCw,
  Plus,
  Upload,
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
  X,
  Save,
  FolderOpen,
  Lock,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const TEXT_EXTENSIONS = new Set([
  '.php', '.html', '.htm', '.css', '.js', '.ts', '.json', '.txt', '.md',
  '.env', '.yml', '.yaml', '.xml', '.htaccess', '.conf', '.sh', '.sql',
  '.log', '.py', '.rb',
])

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
  permissions: string
  extension?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pl-PL') +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  )
}

function isTextFile(entry: FileEntry): boolean {
  if (entry.type === 'directory') return false
  const ext = entry.extension ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.type === 'directory') {
    return <Folder className="w-4 h-4 text-amber-400" />
  }
  const ext = entry.extension ?? ''
  if (['.php'].includes(ext)) return <FileCode className="w-4 h-4 text-purple-400" />
  if (['.html', '.htm'].includes(ext)) return <FileCode className="w-4 h-4 text-orange-400" />
  if (['.css'].includes(ext)) return <FileCode className="w-4 h-4 text-blue-400" />
  if (['.js', '.ts'].includes(ext)) return <FileCode className="w-4 h-4 text-yellow-400" />
  if (['.json', '.yml', '.yaml', '.xml'].includes(ext))
    return <FileCode className="w-4 h-4 text-cyan-400" />
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext))
    return <FileImage className="w-4 h-4 text-green-400" />
  if (['.zip', '.gz', '.tar', '.rar', '.7z'].includes(ext))
    return <FileArchive className="w-4 h-4 text-gray-400" />
  return <File className="w-4 h-4 text-[var(--text-muted)]" />
}

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

function Breadcrumbs({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate: (p: string) => void
}) {
  // currentPath is like "" | "/domain.com" | "/domain.com/public"
  // We always show /var/www as root
  const cleanPath = currentPath === '/' ? '' : currentPath
  const segments = cleanPath.split('/').filter(Boolean) // e.g. ["domain.com", "public"]

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        className="text-[var(--primary)] hover:underline font-medium"
        onClick={() => onNavigate('/var/www')}
      >
        /var/www
      </button>
      {segments.map((seg, i) => {
        const pathUpTo = '/' + segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
            {isLast ? (
              <span className="text-[var(--text-primary)] font-medium">{seg}</span>
            ) : (
              <button
                className="text-[var(--primary)] hover:underline"
                onClick={() => onNavigate('/var/www' + pathUpTo)}
              >
                {seg}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl glass-card border border-green-500/30 text-green-400 text-sm font-medium shadow-2xl">
      <span>{message}</span>
      <button onClick={onClose}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState('/var/www')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editor
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderLoading, setNewFolderLoading] = useState(false)
  const [showRename, setShowRename] = useState<FileEntry | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  // chmod
  const [chmodFile, setChmodFile] = useState<FileEntry | null>(null)
  const [chmodMode, setChmodMode] = useState('644')
  const [chmodLoading, setChmodLoading] = useState(false)

  // Upload
  const uploadRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // Toast
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => setToast(msg)

  // ── Fetch directory ──────────────────────────────────────────────────────────
  const fetchDirectory = useCallback(async (dirPath: string) => {
    setLoading(true)
    setError(null)
    setEditingFile(null)
    try {
      const result = await api.get<{
        entries: FileEntry[]
        currentPath: string
        parentPath: string | null
      }>(`/api/files/list?path=${encodeURIComponent(dirPath)}`)
      setEntries(result.entries)
      setCurrentPath(dirPath)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas wczytywania katalogu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDirectory('/var/www')
  }, [fetchDirectory])

  // ── Navigate back (parent) ───────────────────────────────────────────────────
  const goUp = () => {
    if (currentPath === '/var/www') return
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/var/www'
    const safePar = parent.startsWith('/var/www') ? parent : '/var/www'
    fetchDirectory(safePar)
  }

  // ── Entry click ──────────────────────────────────────────────────────────────
  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      fetchDirectory('/var/www' + entry.path)
      return
    }
    if (!isTextFile(entry)) {
      // Download directly
      window.location.href = `${API_URL}/api/files/download?path=${encodeURIComponent(entry.path)}`
      return
    }
    // Open in editor
    try {
      const result = await api.get<{ content: string; path: string }>(
        `/api/files/read?path=${encodeURIComponent(entry.path)}`
      )
      setEditingFile({ path: entry.path, content: result.content })
      setEditorContent(result.content)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie można otworzyć pliku')
    }
  }

  // ── Save file ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      await api.post('/api/files/write', { path: editingFile.path, content: editorContent })
      setEditingFile({ ...editingFile, content: editorContent })
      showToast('Zapisano!')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas zapisywania')
    } finally {
      setSaving(false)
    }
  }

  // ── New folder ───────────────────────────────────────────────────────────────
  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return
    setNewFolderLoading(true)
    try {
      const newPath =
        (currentPath === '/var/www' ? '' : currentPath.replace('/var/www', '')) +
        '/' +
        newFolderName.trim()
      await api.post('/api/files/mkdir', { path: newPath })
      setShowNewFolder(false)
      setNewFolderName('')
      fetchDirectory(currentPath)
      showToast('Folder utworzony')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia folderu')
    } finally {
      setNewFolderLoading(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (entry: FileEntry) => {
    const label = entry.type === 'directory' ? `katalog "${entry.name}"` : `plik "${entry.name}"`
    if (!confirm(`Usunąć ${label}? Tej operacji nie można cofnąć.`)) return

    try {
      await fetch(`${API_URL}/api/files/delete`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path }),
      }).then(async (res) => {
        const json = await res.json()
        if (!json.success) throw new Error(json.error ?? 'Błąd')
      })
      fetchDirectory(currentPath)
      if (editingFile?.path === entry.path) setEditingFile(null)
      showToast('Usunięto')
    } catch (err: any) {
      setError(err?.message ?? 'Błąd podczas usuwania')
    }
  }

  // ── Rename ───────────────────────────────────────────────────────────────────
  const handleRenameSubmit = async () => {
    if (!showRename || !renameTo.trim()) return
    setRenameLoading(true)
    try {
      const dir = showRename.path.split('/').slice(0, -1).join('/')
      const toPath = dir + '/' + renameTo.trim()
      await api.post('/api/files/rename', { from: showRename.path, to: toPath })
      setShowRename(null)
      setRenameTo('')
      fetchDirectory(currentPath)
      showToast('Zmieniono nazwę')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas zmiany nazwy')
    } finally {
      setRenameLoading(false)
    }
  }

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(buffer))
      )
      const dirPath = currentPath === '/var/www' ? '/' : currentPath.replace('/var/www', '')
      await api.post('/api/files/upload', {
        path: dirPath || '/',
        filename: file.name,
        content: base64,
      })
      fetchDirectory(currentPath)
      showToast(`Przesłano: ${file.name}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas przesyłania')
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  // ── Chmod ────────────────────────────────────────────────────────────────────
  const handleChmod = async () => {
    if (!chmodFile) return
    if (!/^[0-7]{3,4}$/.test(chmodMode)) {
      setError('Nieprawidłowy format uprawnień (np. 644, 755)')
      return
    }
    setChmodLoading(true)
    try {
      await api.post('/api/files/chmod', {
        path: chmodFile.path,
        mode: chmodMode,
      })
      setChmodFile(null)
      fetchDirectory(currentPath)
      showToast(`Uprawnienia zmienione na ${chmodMode}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas zmiany uprawnień')
    } finally {
      setChmodLoading(false)
    }
  }

  // ── Derived: relative path display ───────────────────────────────────────────
  const relPath = currentPath.startsWith('/var/www') ? currentPath.slice(8) || '/' : '/'

  return (
    <div className="min-h-screen">
      <Topbar title="Menedżer plików" subtitle={currentPath} />

      <div className="p-6 space-y-4">
        {/* Breadcrumbs */}
        <div className="glass rounded-xl px-4 py-2.5 border border-white/[0.06]">
          <Breadcrumbs
            currentPath={relPath}
            onNavigate={fetchDirectory}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={goUp}
            disabled={currentPath === '/var/www'}
          >
            <ArrowLeft className="w-4 h-4" />
            Wstecz
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fetchDirectory(currentPath)}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <Button size="sm" onClick={() => { setShowNewFolder(true); setNewFolderName('') }}>
            <Plus className="w-4 h-4" />
            Nowy folder
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => uploadRef.current?.click()}
            loading={uploading}
          >
            <Upload className="w-4 h-4" />
            Prześlij plik
          </Button>
          <input
            ref={uploadRef}
            type="file"
            className="hidden"
            onChange={handleUploadChange}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* File list */}
        <Card className="p-0 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="w-6" />
            <span className="flex-1">Nazwa</span>
            <span className="hidden sm:block w-24 text-right">Rozmiar</span>
            <span className="hidden md:block w-36">Zmodyfikowano</span>
            <span className="hidden lg:block w-16">Uprawnienia</span>
            <span className="w-24" />
          </div>

          {loading && (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <EmptyState
              icon={FolderOpen}
              title="Pusty katalog"
              description="Ten katalog jest pusty. Możesz przesłać pliki lub utworzyć nowy folder."
              action={{ label: 'Prześlij plik', onClick: () => uploadRef.current?.click() }}
            />
          )}

          {!loading &&
            entries.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] group transition-colors cursor-pointer"
                onDoubleClick={() => handleEntryClick(entry)}
                onClick={() => {
                  if (entry.type === 'directory') handleEntryClick(entry)
                }}
              >
                {/* Icon */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                  <FileIcon entry={entry} />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium text-[var(--text-primary)] truncate font-mono"
                    title={entry.name}
                  >
                    {entry.name}
                  </p>
                  {entry.type === 'file' && isTextFile(entry) && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      Kliknij dwukrotnie aby edytować
                    </p>
                  )}
                </div>

                {/* Size */}
                <div className="hidden sm:block w-24 text-right text-sm text-[var(--text-muted)]">
                  {entry.type === 'directory' ? '—' : formatSize(entry.size)}
                </div>

                {/* Modified */}
                <div className="hidden md:block w-36 text-sm text-[var(--text-muted)]">
                  {formatDate(entry.modifiedAt)}
                </div>

                {/* Permissions */}
                <div className="hidden lg:block w-16 text-sm font-mono text-[var(--text-muted)]">
                  {entry.permissions}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 w-24 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {entry.type === 'file' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Pobierz"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `${API_URL}/api/files/download?path=${encodeURIComponent(entry.path)}`
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Zmień nazwę"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowRename(entry)
                      setRenameTo(entry.name)
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Uprawnienia (chmod)"
                    onClick={(e) => {
                      e.stopPropagation()
                      setChmodFile(entry)
                      setChmodMode(entry.permissions?.replace(/[^0-7]/g, '').slice(-3) || '644')
                    }}
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    title="Usuń"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(entry)
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
        </Card>

        {/* Inline editor */}
        {editingFile && (
          <Card className="p-0 overflow-hidden">
            {/* Editor header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                <span className="text-sm font-mono text-[var(--text-primary)] truncate">
                  /var/www{editingFile.path}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" onClick={handleSave} loading={saving}>
                  <Save className="w-4 h-4" />
                  Zapisz
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingFile(null)}
                >
                  <X className="w-4 h-4" />
                  Zamknij
                </Button>
              </div>
            </div>

            {/* Textarea */}
            <div className="p-4">
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                spellCheck={false}
                className="w-full font-mono text-sm bg-black/30 border border-white/10 rounded-xl p-4 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/50 resize-y transition-all"
                style={{ minHeight: '420px', tabSize: 2 }}
              />
            </div>
          </Card>
        )}
      </div>

      {/* New Folder Modal */}
      <Modal
        open={showNewFolder}
        onClose={() => { setShowNewFolder(false); setNewFolderName('') }}
        title="Nowy folder"
        description={`Tworzenie w: ${currentPath}`}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nazwa folderu"
            placeholder="np. public_html"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNewFolder()}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleNewFolder}
              loading={newFolderLoading}
              disabled={!newFolderName.trim()}
            >
              Utwórz
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!showRename}
        onClose={() => { setShowRename(null); setRenameTo('') }}
        title="Zmień nazwę"
        description={showRename ? `Bieżąca nazwa: ${showRename.name}` : ''}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nowa nazwa"
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => { setShowRename(null); setRenameTo('') }}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleRenameSubmit}
              loading={renameLoading}
              disabled={!renameTo.trim()}
            >
              Zmień nazwę
            </Button>
          </div>
        </div>
      </Modal>

      {/* Chmod Modal */}
      <Modal
        open={!!chmodFile}
        onClose={() => setChmodFile(null)}
        title="Zmień uprawnienia (chmod)"
        description={chmodFile ? chmodFile.name : ''}
        size="sm"
      >
        <div className="space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
              Szybkie ustawienia
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { mode: '644', label: 'Plik' },
                { mode: '755', label: 'Wykonywalny' },
                { mode: '777', label: 'Pełny' },
                { mode: '400', label: 'Tylko odczyt' },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChmodMode(mode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    chmodMode === mode
                      ? 'gradient-brand text-white border-transparent shadow-[0_0_10px_rgba(233,30,140,0.25)]'
                      : 'glass text-[var(--text-secondary)] border-white/10 hover:text-[var(--text-primary)]'
                  }`}
                >
                  <code className="mr-1">{mode}</code>{label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Tryb oktalny"
            placeholder="np. 644"
            value={chmodMode}
            onChange={(e) => setChmodMode(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setChmodFile(null)}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleChmod}
              loading={chmodLoading}
              disabled={!/^[0-7]{3,4}$/.test(chmodMode)}
            >
              Zastosuj
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
