import { z } from 'zod';

const booleanString = (defaultValue = false) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const optionalBase64 = z
  .string()
  .default('')
  .refine((value) => value === '' || /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'Must be valid base64');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_BASE_URL: z.url().default('http://localhost:3000'),
    CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().min(1),
    JWT_ISSUER: z.string().min(1).default('taskmaster-api'),
    JWT_AUDIENCE: z.string().min(1).default('taskmaster-client'),
    JWT_PRIVATE_KEY_BASE64: optionalBase64,
    JWT_PUBLIC_KEY_BASE64: optionalBase64,
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    REFRESH_COOKIE_NAME: z.string().min(1).default('taskmaster_refresh'),
    CURSOR_SECRET: z.string().min(32),
    PASSWORD_PEPPER: z.string().default(''),
    INVITATION_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('taskmaster'),
    S3_ACCESS_KEY: z.string().min(1).default('minio'),
    S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
    S3_FORCE_PATH_STYLE: booleanString(true),
    ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().max(26_214_400).default(26_214_400),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    NOTIFICATIONS_ENABLED: booleanString(),
    SSE_ENABLED: booleanString(),
    AI_ENABLED: booleanString(),
    AI_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
    AI_MODEL: z.string().default(''),
    OPENAI_API_KEY: z.string().default(''),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((env, context) => {
    if (env.JWT_PRIVATE_KEY_BASE64 === '' || env.JWT_PUBLIC_KEY_BASE64 === '') {
      context.addIssue({
        code: 'custom',
        path: ['JWT_PRIVATE_KEY_BASE64'],
        message: 'JWT key pair is required',
      });
    }
    if (env.AI_ENABLED && (env.AI_PROVIDER === 'disabled' || env.AI_MODEL === '')) {
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'Enabled AI requires provider and model',
      });
    }
    if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY === '') {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OpenAI API key is required',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  return result.data;
}

export function getEnv(): Env {
  cachedEnv ??= loadEnv();
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
