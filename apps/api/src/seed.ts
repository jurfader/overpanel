import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@overpanel.local'
  const password = process.env.ADMIN_PASSWORD ?? 'Admin1234!'
  const hash = await bcrypt.hash(password, 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: hash, name: 'Administrator', role: 'admin' },
  })

  console.log(`✅ Admin ready: ${user.email} / ${password}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
