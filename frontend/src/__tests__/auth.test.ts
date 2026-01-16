import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { validatePassword, hashPassword } from '@/lib/auth';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Auth Library', () => {
  describe('validatePassword', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const result = validatePassword('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters');
    });

    it('should accept passwords with 8 or more characters', () => {
      const result = validatePassword('password123');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept complex passwords', () => {
      const result = validatePassword('MySecure@Password123!');
      expect(result.valid).toBe(true);
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should create different hashes for the same password', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should create verifiable hashes', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);

      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });
  });
});
