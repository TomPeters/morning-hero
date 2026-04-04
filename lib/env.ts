function require(key: string): string {
  const val = process.env[key];
  if (!val) {
    // During `next build` env vars aren't available — skip validation.
    // The app will throw at runtime if they're genuinely missing.
    if (process.env.NEXT_PHASE === 'phase-production-build') return '';
    throw new Error(`Missing env var: ${key}`);
  }
  return val;
}

export const env = {
  databaseUrl:   require('DATABASE_URL'),
  sessionSecret: require('SESSION_SECRET'),
  adminPin:      require('ADMIN_PIN'),
};
