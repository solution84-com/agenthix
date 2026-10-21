import { PrismaClient } from '@prisma/client'

/** The site's one database client, imported everywhere as `#db` (package.json `imports`). */
export const prisma = new PrismaClient()
