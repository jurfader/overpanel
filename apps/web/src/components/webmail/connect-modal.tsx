'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { Lock, AlertCircle } from 'lucide-react'

interface ConnectModalProps {
  open: boolean
  mailbox: string
  onClose: () => void
  onSuccess: () => void
}

export function ConnectModal({ open, mailbox, onClose, onSuccess }: ConnectModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      await api.post('/api/webmail/connect', {
        mailboxAddress: mailbox,
        password,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udalo sie polaczyc ze skrzynka')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Polacz ze skrzynka" description={mailbox}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <Input
          type="password"
          label="Haslo do skrzynki"
          placeholder="Wprowadz haslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          autoFocus
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={loading} disabled={!password}>
            Polacz
          </Button>
        </div>
      </form>
    </Modal>
  )
}
