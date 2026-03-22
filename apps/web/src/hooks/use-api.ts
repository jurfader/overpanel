'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, ApiError } from '@/lib/api'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(path: string): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const hasData = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Show loading spinner only on initial load — not on background refetches
    if (!hasData.current) setLoading(true)
    setError(null)

    api.get<T>(path)
      .then((res) => {
        if (!cancelled) {
          hasData.current = true
          setData(res)
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Błąd połączenia') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [path, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { data, loading, error, refetch }
}
