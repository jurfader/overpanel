import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@overpanel/db'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
}

// Helper — wyciąga zalogowanego usera z tokenu
export function getRequestUser(request: FastifyRequest) {
  return request.user as { id: string; email: string; role: 'admin' | 'client' }
}

// Guard — tylko admin
export async function adminOnly(request: FastifyRequest, reply: FastifyReply) {
  await authMiddleware(request, reply)
  const user = getRequestUser(request)
  if (user.role !== 'admin') {
    reply.code(403).send({ success: false, error: 'Forbidden — admin only' })
  }
}

// Guard — wymaga uprawnienia do sekcji panelu
// null permissions = pełny dostęp (backward compatibility)
export function requireSection(section: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authMiddleware(request, reply)
    const user = getRequestUser(request)
    if (user.role === 'admin') return

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { permissions: true },
    })

    // null = no restrictions (full access) for backward compatibility
    if (!dbUser?.permissions) return

    const perms = JSON.parse(dbUser.permissions) as { sections: string[] }
    if (!perms.sections.includes(section)) {
      reply.code(403).send({ success: false, error: 'Brak uprawnień do tej sekcji' })
    }
  }
}
