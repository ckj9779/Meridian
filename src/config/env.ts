// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env.local before reading process.env. Safe to run multiple times.
loadDotenv({ path: '.env.local' });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;
