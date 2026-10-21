import { prisma } from '#db'
import { hqConnectionManager } from '../hq/hqConnection'
import { sealConnectionToken } from '../hq/connectionToken'
import { Logger } from '../utils/logger'

const logger = new Logger('registration')

/**
 * Stores the link to hq (pairing's), and dials hq's channel with it now rather than at the next boot. `pairedHqUrl`
 * is the `HQ_URL` it came from; a move hq said it makes is kept only with `keepMove` (hq/addressFollow.ts).
 */
export async function storeHqLink(link: {
  orgId: string | null; hqUrl: string; hqWsUrl: string; machineCredential: string; pairedHqUrl?: string; keepMove?: boolean
}): Promise<void> {
  const data = {
    orgId: link.orgId,
    hqUrl: link.hqUrl,
    hqWsUrl: link.hqWsUrl,
    connectionToken: sealConnectionToken(link.machineCredential),
    status: 'PENDING',
    pairedHqUrl: link.pairedHqUrl ?? null,
    ...(link.keepMove ? {} : { movingTo: null, movingSince: null, moveProblem: null }),
  }
  await prisma.hqConnection.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: { ...data, updatedAt: new Date() },
  })
  hqConnectionManager.restart().catch(err => logger.error('restart after pairing failed', err))
}
