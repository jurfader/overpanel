'use client'

import { useEffect, useState, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { SystemStats } from '@overpanel/shared'
import { useAuthStore } from '@/store/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export function useSocketStats() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    const socket = io(API_URL, {
      auth: { token },
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
    })

    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('stats', (data: SystemStats) => setStats(data))

    return () => {
      socket.disconnect()
    }
  }, [token])

  return { stats, connected }
}
