export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'vacinei_default_jwt_secret_key_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },
  refreshToken: {
    expiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30,
  },
  passwordReset: {
    expiresInMinutes: 10,
    maxAttempts: 3,
    blockMinutes: 15,
  },
};
