import { defineConfig } from '@prisma/config';
import 'dotenv/config';
declare const process: any;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
});
