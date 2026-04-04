function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const env = {
  databaseUrl:   require('DATABASE_URL'),
  sessionSecret: require('SESSION_SECRET'),
  adminPin:      require('ADMIN_PIN'),
};
