import 'server-only';

import { z } from 'zod';

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;

    return protocol === 'http:' || protocol === 'https:';
  }, 'Must use HTTP or HTTPS');

const serverEnvironmentSchema = z
  .object({
    APP_URL: httpUrlSchema,
    SESSION_SECRET: z.string().min(32, 'Must contain at least 32 characters'),
    SPOTIFY_CLIENT_ID: z.string().trim().min(1, 'Required'),
    SPOTIFY_CLIENT_SECRET: z.string().min(1, 'Required'),
    SPOTIFY_REDIRECT_URI: httpUrlSchema,
  })
  .superRefine((environment, context) => {
    const applicationUrl = new URL(environment.APP_URL);
    const redirectUrl = new URL(environment.SPOTIFY_REDIRECT_URI);

    if (applicationUrl.origin !== redirectUrl.origin) {
      context.addIssue({
        code: 'custom',
        message: 'Must have the same origin as APP_URL',
        path: ['SPOTIFY_REDIRECT_URI'],
      });
    }

    if (redirectUrl.pathname !== '/api/auth/spotify/callback') {
      context.addIssue({
        code: 'custom',
        message: 'Must point to /api/auth/spotify/callback',
        path: ['SPOTIFY_REDIRECT_URI'],
      });
    }

    if (redirectUrl.search || redirectUrl.hash) {
      context.addIssue({
        code: 'custom',
        message: 'Must not contain a query string or fragment',
        path: ['SPOTIFY_REDIRECT_URI'],
      });
    }

    if (
      process.env.NODE_ENV === 'production' &&
      (applicationUrl.protocol !== 'https:' || redirectUrl.protocol !== 'https:')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Production URLs must use HTTPS',
        path: ['APP_URL'],
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

const sessionSecretSchema = z.string().min(32, 'Must contain at least 32 characters');

export class EnvironmentConfigurationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid server environment configuration: ${variables.join(', ')}`);
    this.name = 'EnvironmentConfigurationError';
    this.variables = variables;
  }
}

export function getSessionSecret(): string {
  const result = sessionSecretSchema.safeParse(process.env.SESSION_SECRET);

  if (!result.success) {
    throw new EnvironmentConfigurationError(['SESSION_SECRET']);
  }

  return result.data;
}

/**
 * Reads and validates server-only configuration when a runtime path needs it.
 *
 * Keeping this validation behind a function allows `next build` and type generation
 * to run in environments that intentionally do not have Spotify secrets.
 */
export function getServerEnv(): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse({
    APP_URL: process.env.APP_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
  });

  if (!result.success) {
    const variables = [
      ...new Set(
        result.error.issues.map((issue) => {
          const [variable] = issue.path;

          return typeof variable === 'string' ? variable : 'server environment';
        }),
      ),
    ];

    throw new EnvironmentConfigurationError(variables);
  }

  return result.data;
}
