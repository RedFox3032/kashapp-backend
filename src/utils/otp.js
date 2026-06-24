import { randomInt } from 'crypto';

const OTP_EXPIRY_MINUTES = 5;

export function generateOtp() {
  return String(randomInt(100000, 999999));
}

export function getExpiry() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + OTP_EXPIRY_MINUTES);
  return date.toISOString();
}

export function isExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}
