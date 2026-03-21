import type { FastifyRequest, FastifyReply } from 'fastify'

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
