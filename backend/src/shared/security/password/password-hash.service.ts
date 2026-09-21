import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { PasswordService } from './password.types.js';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_LENGTH = 16;
const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordHashService implements PasswordService {
  async hash(plainText: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_LENGTH);
    const derivedKey = (await scrypt(plainText, salt, SCRYPT_KEY_LENGTH)) as Buffer;
    return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
  }

  async verify(plainText: string, encodedHash: string): Promise<boolean> {
    try {
      if (!encodedHash.startsWith('scrypt$')) {
        return await bcrypt.compare(plainText, encodedHash);
      }

      const [, encodedSalt, encodedKey] = encodedHash.split('$');
      if (!encodedSalt || !encodedKey) return false;
      const salt = Buffer.from(encodedSalt, 'base64url');
      const expectedKey = Buffer.from(encodedKey, 'base64url');
      const actualKey = (await scrypt(plainText, salt, expectedKey.length)) as Buffer;
      return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
    } catch {
      return false;
    }
  }
}
