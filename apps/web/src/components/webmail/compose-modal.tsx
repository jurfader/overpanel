'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import {
  Send, AlertCircle, Paperclip, X, Bold, Italic, Underline,
  List, ListOrdered, Quote, Link2, Type,
  Palette,
} from 'lucide-react'
import type { FullMessage } from './message-view'

// ── Types ──────────────────────────────────────────────────────────────────

interface ComposeModalProps {
  open: boolean
  onClose: () => void
  mailbox: string
  replyTo?: FullMessage | null
  forwardMessage?: FullMessage | null
}

interface AttachmentFile {
  id: string
  blobId: string
  name: string
  size: number
  type: string
}

interface ContactSuggestion {
  name?: string
  email: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildReplySubject(subject: string): string {
  if (/^re:/i.test(subject)) return subject
  return `Re: ${subject}`
}

function buildForwardSubject(subject: string): string {
  if (/^fwd?:/i.test(subject)) return subject
  return `Fwd: ${subject}`
}

function buildReplyHtml(msg: FullMessage): string {
  const date = new Date(msg.receivedAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const from = msg.from[0]?.name || msg.from[0]?.email || ''
  const body = msg.htmlBody || escapeHtml(msg.textBody || '').replace(/\n/g, '<br/>')
  return `<br/><br/><blockquote style="border-left:3px solid rgba(233,30,140,0.4);padding:4px 12px;margin:8px 0;color:#888;">
<div style="font-size:12px;margin-bottom:4px;color:#999;">${date}, ${escapeHtml(from)} napisal(a):</div>
${body}
</blockquote>`
}

function buildForwardHtml(msg: FullMessage): string {
  const date = new Date(msg.receivedAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const from = msg.from.map((a) => a.name ? `${escapeHtml(a.name)} &lt;${escapeHtml(a.email)}&gt;` : escapeHtml(a.email)).join(', ')
  const to = msg.to.map((a) => a.name ? `${escapeHtml(a.name)} &lt;${escapeHtml(a.email)}&gt;` : escapeHtml(a.email)).join(', ')
  const body = msg.htmlBody || escapeHtml(msg.textBody || '').replace(/\n/g, '<br/>')
  return `<br/><br/><div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;margin-top:8px;">
<div style="font-size:12px;color:#999;margin-bottom:8px;">
--- Przekazana wiadomosc ---<br/>
Od: ${from}<br/>
Do: ${to}<br/>
Data: ${escapeHtml(date)}<br/>
Temat: ${escapeHtml(msg.subject)}<br/>
</div>
${body}
</div>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getSignature(mailbox: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(`webmail_signature_${mailbox}`) || ''
}

function getRecentContacts(): ContactSuggestion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('webmail_recent_contacts')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentContacts(contacts: ContactSuggestion[]) {
  if (typeof window === 'undefined') return
  // Keep last 100 unique contacts
  const seen = new Set<string>()
  const unique = contacts.filter((c) => {
    if (seen.has(c.email.toLowerCase())) return false
    seen.add(c.email.toLowerCase())
    return true
  }).slice(0, 100)
  localStorage.setItem('webmail_recent_contacts', JSON.stringify(unique))
}

function addToRecentContacts(emails: string[]) {
  const existing = getRecentContacts()
  const newContacts = emails.map((e) => ({ email: e.trim() }))
  saveRecentContacts([...newContacts, ...existing])
}

// ── Rich Text Toolbar ──────────────────────────────────────────────────────

const FONT_SIZES = [
  { label: 'Maly', value: '2' },
  { label: 'Normalny', value: '3' },
  { label: 'Duzy', value: '5' },
  { label: 'Bardzo duzy', value: '7' },
]

const TEXT_COLORS = [
  '#ffffff', '#E91E8C', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#a1a1aa', '#000000',
]

interface ToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>
}

function RichTextToolbar({ editorRef }: ToolbarProps) {
  const [showFontSize, setShowFontSize] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  const insertLink = () => {
    const url = prompt('Wpisz adres URL:')
    if (url) {
      exec('createLink', url)
    }
  }

  const btnClass = 'w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all duration-150'

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06] bg-white/[0.02] rounded-t-xl flex-wrap">
      <button type="button" className={btnClass} onClick={() => exec('bold')} title="Pogrubienie (Ctrl+B)">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnClass} onClick={() => exec('italic')} title="Kursywa (Ctrl+I)">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnClass} onClick={() => exec('underline')} title="Podkreslenie (Ctrl+U)">
        <Underline className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Font size dropdown */}
      <div className="relative">
        <button type="button" className={btnClass} onClick={() => { setShowFontSize(!showFontSize); setShowColorPicker(false) }} title="Rozmiar czcionki">
          <Type className="w-3.5 h-3.5" />
        </button>
        {showFontSize && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[120px]">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs.value}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
                onClick={() => { exec('fontSize', fs.value); setShowFontSize(false) }}
              >
                {fs.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color picker */}
      <div className="relative">
        <button type="button" className={btnClass} onClick={() => { setShowColorPicker(!showColorPicker); setShowFontSize(false) }} title="Kolor tekstu">
          <Palette className="w-3.5 h-3.5" />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => { exec('foreColor', color); setShowColorPicker(false) }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      <button type="button" className={btnClass} onClick={insertLink} title="Wstaw link">
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnClass} onClick={() => exec('insertUnorderedList')} title="Lista punktowana">
        <List className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnClass} onClick={() => exec('insertOrderedList')} title="Lista numerowana">
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btnClass} onClick={() => exec('formatBlock', 'blockquote')} title="Cytat">
        <Quote className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Contact Autocomplete ───────────────────────────────────────────────────

interface AutocompleteInputProps {
  label: string
  placeholder: string
  value: string
  onChange: (val: string) => void
}

function AutocompleteInput({ label, placeholder, value, onChange }: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateSuggestions = useCallback((text: string) => {
    // Get the current email being typed (after last comma)
    const parts = text.split(',')
    const currentPart = (parts[parts.length - 1] || '').trim().toLowerCase()

    if (currentPart.length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const contacts = getRecentContacts()
    const filtered = contacts.filter((c) =>
      c.email.toLowerCase().includes(currentPart) ||
      (c.name && c.name.toLowerCase().includes(currentPart))
    ).slice(0, 8)

    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
    setSelectedIndex(-1)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val)
    updateSuggestions(val)
  }

  const selectSuggestion = (contact: ContactSuggestion) => {
    const parts = value.split(',')
    parts[parts.length - 1] = ' ' + contact.email
    const newValue = parts.join(',').replace(/^[\s,]+/, '')
    onChange(newValue + ', ')
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => updateSuggestions(value)}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((contact, index) => (
            <button
              key={contact.email}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-[var(--primary)]/20 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]'
              }`}
              onClick={() => selectSuggestion(contact)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {contact.name && (
                <span className="font-medium mr-2">{contact.name}</span>
              )}
              <span className="text-[var(--text-muted)]">{contact.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Compose Modal ─────────────────────────────────────────────────────

export function ComposeModal({ open, onClose, mailbox, replyTo, forwardMessage }: ComposeModalProps) {
  const isReply = !!replyTo
  const isForward = !!forwardMessage

  const initialTo = isReply ? (replyTo.from[0]?.email || '') : ''
  const initialSubject = isReply
    ? buildReplySubject(replyTo.subject)
    : isForward
      ? buildForwardSubject(forwardMessage.subject)
      : ''
  const initialHtml = isReply
    ? buildReplyHtml(replyTo)
    : isForward
      ? buildForwardHtml(forwardMessage)
      : ''

  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [uploading, setUploading] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorInitialized = useRef(false)

  // Initialize editor content
  useEffect(() => {
    if (!editorRef.current || editorInitialized.current) return
    editorInitialized.current = true

    const signature = getSignature(mailbox)
    let content = '<div><br/></div>' // Empty line for typing

    if (initialHtml) {
      content += initialHtml
    }

    if (signature) {
      content += `<div class="signature" style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;color:#888;">--<br/>${signature}</div>`
    }

    editorRef.current.innerHTML = content

    // Focus at the start
    const selection = window.getSelection()
    if (selection && editorRef.current.firstChild) {
      const range = document.createRange()
      range.setStart(editorRef.current.firstChild, 0)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }, [initialHtml, mailbox])

  // ── File Upload ────────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      // Read file as base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix
          const base64 = result.split(',')[1] || ''
          resolve(base64)
        }
        reader.onerror = () => reject(new Error('Nie udalo sie odczytac pliku'))
        reader.readAsDataURL(file)
      })

      const response = await api.post<{ blobId: string; size: number; type: string }>('/api/webmail/upload', {
        mailbox,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        base64Data,
      })

      setAttachments((prev) => [...prev, {
        id: crypto.randomUUID(),
        blobId: response.blobId,
        name: file.name,
        size: response.size,
        type: response.type,
      }])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udalo sie przeslac pliku')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      uploadFile(files[i])
    }
    // Reset input
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      uploadFile(files[i])
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  const getEditorHtml = (): string => {
    return editorRef.current?.innerHTML || ''
  }

  const getEditorText = (): string => {
    return editorRef.current?.innerText || ''
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    setError('')

    try {
      const toAddresses = to.split(',').map((s) => s.trim()).filter(Boolean).map((email) => ({ email }))
      const ccAddresses = showCc && cc ? cc.split(',').map((s) => s.trim()).filter(Boolean).map((email) => ({ email })) : undefined
      const bccAddresses = showBcc && bcc ? bcc.split(',').map((s) => s.trim()).filter(Boolean).map((email) => ({ email })) : undefined

      const htmlBody = getEditorHtml()
      const textBody = getEditorText()

      // Save addresses to recent contacts
      const allEmails = [
        ...to.split(',').map((s) => s.trim()).filter(Boolean),
        ...(showCc && cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : []),
        ...(showBcc && bcc ? bcc.split(',').map((s) => s.trim()).filter(Boolean) : []),
      ]
      addToRecentContacts(allEmails)

      await api.post('/api/webmail/send', {
        mailbox,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject,
        htmlBody: htmlBody || `<p>${escapeHtml(textBody)}</p>`,
        textBody,
        attachmentBlobIds: attachments.length > 0 ? attachments.map((a) => a.blobId) : undefined,
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
            <AutocompleteInput
              label="Do"
              placeholder="adres@example.com"
              value={to}
              onChange={setTo}
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
          <AutocompleteInput
            label="CC"
            placeholder="adres@example.com"
            value={cc}
            onChange={setCc}
          />
        )}

        {showBcc && (
          <AutocompleteInput
            label="BCC"
            placeholder="adres@example.com"
            value={bcc}
            onChange={setBcc}
          />
        )}

        <Input
          label="Temat"
          placeholder="Temat wiadomosci"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        {/* Rich text editor */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
            Tresc
          </label>
          <div
            className={`rounded-xl border transition-all duration-200 ${
              isDragOver
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-white/10 bg-white/5'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <RichTextToolbar editorRef={editorRef} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="px-3 py-2.5 min-h-[200px] max-h-[400px] overflow-y-auto text-sm text-[var(--text-primary)] focus:outline-none [&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--primary)]/40 [&_blockquote]:pl-3 [&_blockquote]:ml-0 [&_blockquote]:text-[var(--text-muted)] [&_a]:text-[var(--primary)] [&_a]:underline [&_.signature]:mt-4 [&_.signature]:border-t [&_.signature]:border-white/[0.08] [&_.signature]:pt-2 [&_.signature]:text-[var(--text-muted)]"
              style={{ wordBreak: 'break-word' }}
            />
            {isDragOver && (
              <div className="px-3 py-4 text-center text-sm text-[var(--primary)]">
                Upusc pliki tutaj...
              </div>
            )}
          </div>
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Zalaczniki
            </label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs group"
                >
                  <Paperclip className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-secondary)] truncate max-w-[150px]">{att.name}</span>
                  <span className="text-[var(--text-muted)]">{formatFileSize(att.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="w-4 h-4 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip className="w-4 h-4" />
            {uploading ? 'Przesylanie...' : 'Zalacz'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="flex-1" />
          <Button type="button" variant="secondary" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" loading={sending} disabled={!to.trim()}>
            <Send className="w-4 h-4" /> Wyslij
          </Button>
        </div>
      </form>
    </Modal>
  )
}
