import bcrypt from "bcryptjs";

const cost = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}