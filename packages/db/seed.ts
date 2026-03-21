import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@overpanel.local'
  const password = process.env.ADMIN_PASSWORD ?? 'admin123'
  const name = 'Administrator'

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    console.log(`Admin already exists: ${email}`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: 'admin' },
  })

  console.log(`✅ Admin created: ${user.email} / ${password}`)
}

main().finally(() => prisma.$disconnect())
