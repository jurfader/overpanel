export interface DockerTemplate {
  id: string
  name: string
  description: string
  category: 'cms' | 'dev' | 'productivity' | 'monitoring' | 'misc'
  image: string
  defaultInternalPort: number
  icon: string  // emoji or icon name
  envVars: Array<{
    key: string
    label: string
    description?: string
    required: boolean
    secret?: boolean
    default?: string
    generated?: 'password' | 'secret'  // auto-generate random value
  }>
  volumes: Array<{
    hostPath: string  // relative to /opt/docker-data/{containerName}
    containerPath: string
    label: string
  }>
  setupNotes?: string  // shown after deploy
}

export const DOCKER_TEMPLATES: DockerTemplate[] = [
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Platforma blogowa nowej generacji',
    category: 'cms',
    image: 'ghost:5-alpine',
    defaultInternalPort: 2368,
    icon: '👻',
    envVars: [
      { key: 'url', label: 'URL strony', required: true, default: 'https://{domain}' },
      { key: 'NODE_ENV', label: 'Środowisko', required: false, default: 'production' },
    ],
    volumes: [
      { hostPath: 'content', containerPath: '/var/lib/ghost/content', label: 'Treść Ghost' },
    ],
    setupNotes: 'Po uruchomieniu przejdź na /ghost aby skonfigurować konto admina.',
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Lekki, self-hosted serwis Git',
    category: 'dev',
    image: 'gitea/gitea:latest',
    defaultInternalPort: 3000,
    icon: '🐙',
    envVars: [
      { key: 'GITEA__server__DOMAIN', label: 'Domena', required: true, default: '{domain}' },
      { key: 'GITEA__server__ROOT_URL', label: 'Root URL', required: true, default: 'https://{domain}' },
      { key: 'GITEA__server__HTTP_PORT', label: 'Port HTTP', required: false, default: '3000' },
    ],
    volumes: [
      { hostPath: 'data', containerPath: '/data', label: 'Dane Gitea' },
    ],
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Chmura plików i współpracy',
    category: 'productivity',
    image: 'nextcloud:apache',
    defaultInternalPort: 80,
    icon: '☁️',
    envVars: [
      { key: 'NEXTCLOUD_ADMIN_USER', label: 'Admin użytkownik', required: true, default: 'admin' },
      { key: 'NEXTCLOUD_ADMIN_PASSWORD', label: 'Admin hasło', required: true, secret: true, generated: 'password' },
      { key: 'NEXTCLOUD_TRUSTED_DOMAINS', label: 'Trusted domains', required: true, default: '{domain}' },
    ],
    volumes: [
      { hostPath: 'data', containerPath: '/var/www/html', label: 'Dane Nextcloud' },
    ],
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Monitoring dostępności serwisów',
    category: 'monitoring',
    image: 'louislam/uptime-kuma:1',
    defaultInternalPort: 3001,
    icon: '📊',
    envVars: [],
    volumes: [
      { hostPath: 'data', containerPath: '/app/data', label: 'Dane Uptime Kuma' },
    ],
    setupNotes: 'Pierwsze uruchomienie pozwoli stworzyć konto admina.',
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Automatyzacja przepływów pracy (no-code)',
    category: 'productivity',
    image: 'n8nio/n8n:latest',
    defaultInternalPort: 5678,
    icon: '⚙️',
    envVars: [
      { key: 'N8N_HOST', label: 'Host', required: true, default: '{domain}' },
      { key: 'N8N_PROTOCOL', label: 'Protokół', required: false, default: 'https' },
      { key: 'N8N_ENCRYPTION_KEY', label: 'Klucz szyfrowania', required: true, generated: 'secret' },
      { key: 'WEBHOOK_URL', label: 'Webhook URL', required: false, default: 'https://{domain}/' },
    ],
    volumes: [
      { hostPath: 'data', containerPath: '/home/node/.n8n', label: 'Dane n8n' },
    ],
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Menedżer haseł (Bitwarden compatible)',
    category: 'misc',
    image: 'vaultwarden/server:latest',
    defaultInternalPort: 80,
    icon: '🔐',
    envVars: [
      { key: 'DOMAIN', label: 'Domena (z https://)', required: true, default: 'https://{domain}' },
      { key: 'ADMIN_TOKEN', label: 'Token admina', required: true, generated: 'secret' },
      { key: 'SIGNUPS_ALLOWED', label: 'Rejestracja', required: false, default: 'false' },
    ],
    volumes: [
      { hostPath: 'data', containerPath: '/data', label: 'Dane Vaultwarden' },
    ],
    setupNotes: 'Panel admina dostępny pod /admin — użyj wygenerowanego ADMIN_TOKEN.',
  },
  {
    id: 'plausible',
    name: 'Plausible Analytics',
    description: 'Prywatna analityka webowa',
    category: 'monitoring',
    image: 'ghcr.io/plausible/community-edition:v2',
    defaultInternalPort: 8000,
    icon: '📈',
    envVars: [
      { key: 'SECRET_KEY_BASE', label: 'Secret key', required: true, generated: 'secret' },
      { key: 'BASE_URL', label: 'Base URL', required: true, default: 'https://{domain}' },
    ],
    volumes: [
      { hostPath: 'data', containerPath: '/var/lib/plausible', label: 'Dane Plausible' },
    ],
  },
  {
    id: 'mattermost',
    name: 'Mattermost',
    description: 'Komunikator zespołowy (Slack alternative)',
    category: 'productivity',
    image: 'mattermost/mattermost-team-edition:latest',
    defaultInternalPort: 8065,
    icon: '💬',
    envVars: [
      { key: 'MM_SERVICESETTINGS_SITEURL', label: 'Site URL', required: true, default: 'https://{domain}' },
    ],
    volumes: [
      { hostPath: 'config', containerPath: '/mattermost/config', label: 'Konfiguracja' },
      { hostPath: 'data', containerPath: '/mattermost/data', label: 'Dane' },
    ],
  },
  {
    id: 'custom',
    name: 'Własny obraz',
    description: 'Dowolny obraz Docker',
    category: 'misc',
    image: '',
    defaultInternalPort: 80,
    icon: '🐳',
    envVars: [],
    volumes: [],
  },
]

export function getTemplate(id: string): DockerTemplate | undefined {
  return DOCKER_TEMPLATES.find(t => t.id === id)
}

// Generate random password/secret
export function generateSecret(length = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
