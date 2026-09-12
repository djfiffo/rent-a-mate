import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { PasswordService } from './users.types.js';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class BcryptPasswordService implements PasswordService {
  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
  }

  async verify(plainText: string, encodedHash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainText, encodedHash);
    } catch {
      return false;
    }
  }
}
