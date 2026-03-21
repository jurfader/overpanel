'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { Send, AlertCircle } from 'lucide-react'
import type { FullMessage } from './message-view'

interface ComposeModalProps {
  open: boolean
  onClose: () => void
  mailbox: string
  replyTo?: FullMessage | null
  forwardMessage?: FullMessage | null
}

function buildReplySubject(subject: string): string {
  if (/^re:/i.test(subject)) return subject
  return `Re: ${subject}`
}

function buildForwardSubject(subject: string): string {
  if (/^fwd?:/i.test(subject)) return subject
  return `Fwd: ${subject}`
}

function buildReplyBody(msg: FullMessage): string {
  const date = new Date(msg.receivedAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const from = msg.from[0]?.name || msg.from[0]?.email || ''
  const body = msg.textBody || ''
  return `\n\n--- ${date}, ${from} napisal(a): ---\n${body}`
}

function buildForwardBody(msg: FullMessage): string {
  const date = new Date(msg.receivedAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const from = msg.from.map((a) => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')
  const to = msg.to.map((a) => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')
  const body = msg.textBody || ''
  return `\n\n--- Przekazana wiadomosc ---\nOd: ${from}\nDo: ${to}\nData: ${date}\nTemat: ${msg.subject}\n\n${body}`
}

export function ComposeModal({ open, onClose, mailbox, replyTo, forwardMessage }: ComposeModalProps) {
  const isReply = !!replyTo
  const isForward = !!forwardMessage

  const initialTo = isReply ? (replyTo.from[0]?.email || '') : ''
  const initialSubject = isReply
    ? buildReplySubject(replyTo.subject)
    : isForward
      ? buildForwardSubject(forwardMessage.subject)
      : ''
  const initialBody = isReply
    ? buildReplyBody(replyTo)
    : isForward
      ? buildForwardBody(forwardMessage)
      : ''

  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    setError('')
    try {
      await api.post('/api/webmail/send', {
        mailbox,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        cc: showCc && cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        bcc: showBcc && bcc ? bcc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        subject,
        textBody: body,
        htmlBody: undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udalo sie wyslac wiadomosci')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isReply ? 'Odpowiedz' : isForward ? 'Przekaz dalej' : 'Nowa wiadomosc'} size="lg">
      <form onSubmit={handleSend} className="space-y-3">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              label="Do"
              placeholder="adres@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex gap-1 pt-5">
            <button
              type="button"
              onClick={() => setShowCc(!showCc)}
              className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded transition-colors"
            >
              CC
            </button>
            <button
              type="button"
              onClick={() => setShowBcc(!showBcc)}
              className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded transition-colors"
            >
              BCC
            </button>
          </div>
        </div>

        {showCc && (
          <Input
            label="CC"
            placeholder="adres@example.com"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          />
        )}

        {showBcc && (
          <Input
            label="BCC"
            placeholder="adres@example.com"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
          />
        )}

        <Input
          label="Temat"
          placeholder="Temat wiadomosci"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
            Tresc
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="w-full rounded-xl text-sm transition-all duration-200 bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/50 focus:bg-white/7 focus:shadow-[0_0_0_3px_rgba(233,30,140,0.1)] px-3 py-2.5 resize-y min-h-[120px]"
            placeholder="Napisz wiadomosc..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" className="flex-1" loading={sending} disabled={!to.trim()}>
            <Send className="w-4 h-4" /> Wyslij
          </Button>
        </div>
      </form>
    </Modal>
  )
}
