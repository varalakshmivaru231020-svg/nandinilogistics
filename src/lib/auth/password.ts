import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Enterprise password policy, enforced on set and on reset. */
export function validatePasswordStrength(pwd: string): string | null {
  if (pwd.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(pwd)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must contain a digit.";
  if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must contain a symbol.";
  return null;
}
