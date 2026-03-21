'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { Database, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface CreateDbModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface CreatedDb {
  name: string
  engine: string
  dbUser: string
  password: string
  host: string
  port: number
}

export function CreateDbModal({ open, onClose, onSuccess }: CreateDbModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedDb | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ name: '', engine: 'mysql' })

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await api.post<CreatedDb>('/api/databases', form)
      setCreated(result)
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd podczas tworzenia bazy')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setCreated(null)
    setForm({ name: '', engine: 'mysql' })
    setError('')
    onClose()
  }

  // Ekran po stworzeniu — pokaż dane połączenia
  if (created) {
    return (
      <Modal open={open} onClose={handleClose} title="Baza danych utworzona" size="md">
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            Baza <strong>{created.name}</strong> ({created.engine.toUpperCase()}) została utworzona. Zapisz hasło — nie będzie dostępne ponownie.
          </div>

          {[
            { label: 'Host', value: created.host, key: 'host' },
            { label: 'Port', value: String(created.port), key: 'port' },
            { label: 'Baza danych', value: created.name, key: 'db' },
            { label: 'Użytkownik', value: created.dbUser, key: 'user' },
          ].map(({ label, value, key }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
                <code className="text-sm text-[var(--text-primary)] font-mono">{value}</code>
              </div>
              <button
                onClick={() => handleCopy(value, key)}
                className="w-8 h-8 rounded-lg glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {copied === key ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ))}

          {/* Password */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Hasło</p>
              <code className="text-sm text-[var(--text-primary)] font-mono">
                {showPass ? created.password : '••••••••••••••••'}
              </code>
            </div>
            <button onClick={() => setShowPass((v) => !v)} className="w-8 h-8 rounded-lg glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={() => handleCopy(created.password, 'pass')} className="w-8 h-8 rounded-lg glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
              {copied === 'pass' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <Button className="w-full" onClick={handleClose}>Gotowe</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nowa baza danych" description="Utwórz bazę MySQL lub PostgreSQL">
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nazwa bazy"
          placeholder="moja_baza"
          value={form.name}
          onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          icon={<Database className="w-4 h-4" />}
          required
        />
        <p className="text-xs text-[var(--text-muted)] -mt-2">
          Tylko małe litery, cyfry i podkreślniki. Użytkownik DB: <code className="text-[var(--primary)]">op_{form.name || '...'}</code>
        </p>

        <Select
          label="Silnik bazy danych"
          value={form.engine}
          onChange={(e) => set('engine', e.target.value)}
        >
          <option value="mysql">MySQL 8.0</option>
          <option value="postgresql">PostgreSQL 16</option>
        </Select>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>Anuluj</Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {!loading && 'Utwórz bazę'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
