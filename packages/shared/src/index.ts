// Roles
export type UserRole = 'admin' | 'client'

// Auth
export interface LoginRequest {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  siteCount?: number
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

// Sites
export type SiteStatus = 'active' | 'inactive' | 'pending'
export type PhpVersion = '7.4' | '8.0' | '8.1' | '8.2' | '8.3'

export type SiteType = 'php' | 'nodejs' | 'python' | 'proxy' | 'static'

export interface Site {
  id: string
  domain: string
  status: SiteStatus
  siteType: SiteType
  phpVersion: PhpVersion
  documentRoot: string
  appPort: number | null
  startCommand: string | null
  nginxConfig: string | null
  userId: string
  hasSSL: boolean
  sslExpiry: string | null
  hasWordpress: boolean
  wpVersion: string | null
  diskUsageMb: number
  createdAt: string
  updatedAt: string
}

// Databases
export type DbEngine = 'mysql' | 'postgresql'

export interface Database {
  id: string
  name: string
  engine: DbEngine
  dbUser: string
  host: string
  port: number
  siteId: string | null
  userId: string
  sizeMb: number
  createdAt: string
  updatedAt: string
}

// DNS
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'CAA' | 'NS'

export interface DnsRecord {
  id: string
  type: DnsRecordType
  name: string
  content: string
  ttl: number
  proxied: boolean
  zoneId: string
}

// System Stats (socket.io)
export interface SystemStats {
  cpu: number          // percent 0-100
  ram: {
    used: number       // bytes
    total: number      // bytes
    percent: number
  }
  disk: {
    used: number       // bytes
    total: number      // bytes
    percent: number
  }
  network: {
    rx: number         // bytes/s
    tx: number         // bytes/s
  }
  uptime: number       // seconds
  loadAvg: [number, number, number]
}

// API responses
export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Pagination
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  perPage: number
}

// Audit log
export interface AuditEntry {
  id: string
  userId: string
  userName: string
  action: string
  resource: string
  resourceId: string | null
  ip: string
  createdAt: string
}
