'use client'

import { useState, useRef, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Save, Code, Eye } from 'lucide-react'

interface SignatureSettingsProps {
  open: boolean
  onClose: () => void
  mailbox: string
}

function getSignature(mailbox: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(`webmail_signature_${mailbox}`) || ''
}

function saveSignature(mailbox: string, html: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`webmail_signature_${mailbox}`, html)
}

export function SignatureSettings({ open, onClose, mailbox }: SignatureSettingsProps) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual')
  const [htmlSource, setHtmlSource] = useState('')
  const [saved, setSaved] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // Load signature on open
  useEffect(() => {
    if (!open) {
      initialized.current = false
      return
    }

    const sig = getSignature(mailbox)
    setHtmlSource(sig)

    // Wait for DOM
    requestAnimationFrame(() => {
      if (editorRef.current && !initialized.current) {
        editorRef.current.innerHTML = sig || '<p>Wpisz swoj podpis...</p>'
        initialized.current = true
      }
    })
  }, [open, mailbox])

  const syncFromEditor = () => {
    if (editorRef.current) {
      setHtmlSource(editorRef.current.innerHTML)
    }
  }

  const syncFromHtml = () => {
    if (editorRef.current) {
      editorRef.current.innerHTML = htmlSource
    }
  }

  const handleSwitchMode = (newMode: 'visual' | 'html') => {
    if (newMode === 'html' && mode === 'visual') {
      syncFromEditor()
    } else if (newMode === 'visual' && mode === 'html') {
      syncFromHtml()
    }
    setMode(newMode)
  }

  const handleSave = () => {
    if (mode === 'visual' && editorRef.current) {
      const html = editorRef.current.innerHTML
      saveSignature(mailbox, html)
      setHtmlSource(html)
    } else {
      saveSignature(mailbox, htmlSource)
      if (editorRef.current) {
        editorRef.current.innerHTML = htmlSource
      }
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Modal open={open} onClose={onClose} title="Podpis e-mail" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Podpis zostanie automatycznie dolaczony do kazdej nowej wiadomosci z adresu <span className="text-[var(--text-secondary)] font-medium">{mailbox}</span>.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => handleSwitchMode('visual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'visual'
                ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Eye className="w-3 h-3" />
            Wizualny
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'html'
                ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Code className="w-3 h-3" />
            HTML
          </button>
        </div>

        {/* Editor area */}
        {mode === 'visual' ? (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full min-h-[150px] max-h-[300px] overflow-y-auto rounded-xl text-sm bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/50 focus:bg-white/7 focus:shadow-[0_0_0_3px_rgba(233,30,140,0.1)] px-3 py-2.5 [&_a]:text-[var(--primary)] [&_a]:underline"
            style={{ wordBreak: 'break-word' }}
          />
        ) : (
          <textarea
            value={htmlSource}
            onChange={(e) => setHtmlSource(e.target.value)}
            rows={8}
            className="w-full rounded-xl text-sm transition-all duration-200 bg-white/5 border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]/50 focus:bg-white/7 focus:shadow-[0_0_0_3px_rgba(233,30,140,0.1)] px-3 py-2.5 resize-y font-mono text-xs"
            placeholder="<p>Twoj podpis HTML...</p>"
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Zamknij
          </Button>
          <div className="flex-1" />
          <Button type="button" onClick={handleSave}>
            <Save className="w-4 h-4" />
            {saved ? 'Zapisano!' : 'Zapisz podpis'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
