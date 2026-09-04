process.env.DATABASE_URL = 'postgresql://crmuser:zalocrm_secure_password@127.0.0.1:5433/zalocrm';

import { prisma } from '../backend/src/shared/database/prisma-client.js';

async function main() {
  console.log('Ready');
}

main().catch(console.error).finally(() => prisma.$disconnect());
