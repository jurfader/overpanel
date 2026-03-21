'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { FolderSidebar, type WebmailFolder } from '@/components/webmail/folder-sidebar'
import { MessageList, type MessageSummary } from '@/components/webmail/message-list'
import { MessageView, type FullMessage } from '@/components/webmail/message-view'
import { ComposeModal } from '@/components/webmail/compose-modal'
import { Button } from '@/components/ui/button'
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react'

const PAGE_SIZE = 50

export default function WebmailInboxPage() {
  const params = useParams<{ mailbox: string }>()
  const router = useRouter()
  const mailbox = decodeURIComponent(params.mailbox as string)

  // ── State ───────────────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<WebmailFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [fullMessage, setFullMessage] = useState<FullMessage | null>(null)
  const [page, setPage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageLoading, setMessageLoading] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'folders' | 'list' | 'view'>('list')

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<FullMessage | null>(null)
  const [forwardMessage, setForwardMessage] = useState<FullMessage | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE))

  // ── Fetch folders ───────────────────────────────────────────────────────────
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true)
    try {
      const data = await api.get<WebmailFolder[]>(`/api/webmail/folders?mailbox=${encodeURIComponent(mailbox)}`)
      setFolders(data)
      // Auto-select inbox
      if (!selectedFolderId) {
        const inbox = data.find((f) => f.role === 'inbox')
        if (inbox) setSelectedFolderId(inbox.id)
        else if (data.length > 0) setSelectedFolderId(data[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch folders', err)
    } finally {
      setFoldersLoading(false)
    }
  }, [mailbox, selectedFolderId])

  // ── Fetch messages ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!selectedFolderId) return
    setMessagesLoading(true)
    setSelectedMessageId(null)
    setFullMessage(null)
    try {
      const data = await api.get<{ messages: MessageSummary[]; total: number }>(
        `/api/webmail/messages?mailbox=${encodeURIComponent(mailbox)}&folderId=${encodeURIComponent(selectedFolderId)}&page=${page}&limit=${PAGE_SIZE}`
      )
      setMessages(data.messages)
      setTotalMessages(data.total)
    } catch (err) {
      console.error('Failed to fetch messages', err)
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [mailbox, selectedFolderId, page])

  // ── Fetch single message ────────────────────────────────────────────────────
  const fetchMessage = useCallback(async (messageId: string) => {
    setMessageLoading(true)
    try {
      const data = await api.get<FullMessage>(
        `/api/webmail/messages/${encodeURIComponent(messageId)}?mailbox=${encodeURIComponent(mailbox)}`
      )
      setFullMessage(data)
      // Mark as read
      if (!data.isRead) {
        await api.post(`/api/webmail/messages/${encodeURIComponent(messageId)}/read?mailbox=${encodeURIComponent(mailbox)}`)
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isRead: true } : m))
        // Refresh folders to update unread counts
        fetchFolders()
      }
    } catch (err) {
      console.error('Failed to fetch message', err)
    } finally {
      setMessageLoading(false)
    }
  }, [mailbox, fetchFolders])

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFolders()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFolderId) {
      fetchMessages()
    }
  }, [selectedFolderId, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedMessageId) {
      fetchMessage(selectedMessageId)
    }
  }, [selectedMessageId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId)
    setPage(1)
    setSelectedMessageId(null)
    setFullMessage(null)
    setMobilePanel('list')
  }

  const handleSelectMessage = (messageId: string) => {
    setSelectedMessageId(messageId)
    setMobilePanel('view')
  }

  const handleToggleFlag = async (messageId: string) => {
    try {
      await api.post(`/api/webmail/messages/${encodeURIComponent(messageId)}/flag?mailbox=${encodeURIComponent(mailbox)}`)
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isFlagged: !m.isFlagged } : m))
      if (fullMessage && fullMessage.id === messageId) {
        setFullMessage({ ...fullMessage, isFlagged: !fullMessage.isFlagged })
      }
    } catch (err) {
      console.error('Failed to toggle flag', err)
    }
  }

  const handleDelete = async () => {
    if (!fullMessage) return
    try {
      await api.delete(`/api/webmail/messages/${encodeURIComponent(fullMessage.id)}?mailbox=${encodeURIComponent(mailbox)}`)
      setMessages((prev) => prev.filter((m) => m.id !== fullMessage.id))
      setSelectedMessageId(null)
      setFullMessage(null)
      setMobilePanel('list')
      fetchFolders()
    } catch (err) {
      console.error('Failed to delete', err)
    }
  }

  const handleCompose = () => {
    setReplyTo(null)
    setForwardMessage(null)
    setComposeOpen(true)
  }

  const handleReply = () => {
    if (!fullMessage) return
    setReplyTo(fullMessage)
    setForwardMessage(null)
    setComposeOpen(true)
  }

  const handleReplyAll = () => {
    // For reply-all, we use the same reply modal but the user can add more recipients
    handleReply()
  }

  const handleForward = () => {
    if (!fullMessage) return
    setForwardMessage(fullMessage)
    setReplyTo(null)
    setComposeOpen(true)
  }

  const handleFlagFromView = async () => {
    if (!fullMessage) return
    await handleToggleFlag(fullMessage.id)
  }

  const handleDisconnect = async () => {
    try {
      await api.post('/api/webmail/disconnect', { mailboxAddress: mailbox })
      router.push('/webmail')
    } catch (err) {
      console.error('Failed to disconnect', err)
    }
  }

  const handleBack = () => {
    setSelectedMessageId(null)
    setFullMessage(null)
    setMobilePanel('list')
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col">
      {/* Header bar */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-white/[0.06] bg-[#0A0A0F]/95 backdrop-blur-xl flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => router.push('/webmail')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{mailbox}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Webmail</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchMessages} title="Odswiez">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDisconnect} title="Rozlacz" className="text-red-400 hover:text-red-300">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 flex min-h-0">
        {/* Folder sidebar - desktop always visible, mobile toggle */}
        <div
          className={`w-[200px] flex-shrink-0 border-r border-white/[0.06] bg-[#0A0A0F]/50
            ${mobilePanel === 'folders' ? 'block' : 'hidden'} md:block`}
        >
          <FolderSidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onCompose={handleCompose}
          />
        </div>

        {/* Message list panel */}
        <div
          className={`w-full md:w-[350px] flex-shrink-0 border-r border-white/[0.06] flex flex-col
            ${mobilePanel === 'list' ? 'flex' : 'hidden'} md:flex`}
        >
          {/* Mobile folder toggle */}
          <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
            <button
              onClick={() => setMobilePanel('folders')}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Foldery
            </button>
            <span className="text-[var(--text-muted)]">|</span>
            <span className="text-xs text-[var(--text-primary)] font-medium">
              {folders.find((f) => f.id === selectedFolderId)?.name || 'Wiadomosci'}
            </span>
          </div>
          <MessageList
            messages={messages}
            selectedId={selectedMessageId}
            onSelect={handleSelectMessage}
            onToggleFlag={handleToggleFlag}
            loading={messagesLoading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>

        {/* Reading pane */}
        <div
          className={`flex-1 min-w-0 flex flex-col
            ${mobilePanel === 'view' ? 'flex' : 'hidden'} md:flex`}
        >
          {messageLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 text-[var(--primary)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : fullMessage ? (
            <MessageView
              message={fullMessage}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onDelete={handleDelete}
              onFlag={handleFlagFromView}
              onBack={handleBack}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl gradient-subtle border border-[var(--primary)]/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-muted)]">Wybierz wiadomosc do odczytania</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <ComposeModal
          open={composeOpen}
          onClose={() => {
            setComposeOpen(false)
            setReplyTo(null)
            setForwardMessage(null)
          }}
          mailbox={mailbox}
          replyTo={replyTo}
          forwardMessage={forwardMessage}
        />
      )}
    </div>
  )
}
