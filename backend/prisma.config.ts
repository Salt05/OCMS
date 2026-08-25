import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://crmuser:zalocrm_secure_password@localhost:5433/zalocrm',
  },
});
