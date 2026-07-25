import { rateLimit } from 'express-rate-limit';
export const createGeneralRateLimit = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/health'),
  });
export const createRegistrationRateLimit = () =>
  rateLimit({
    windowMs: 3_600_000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
