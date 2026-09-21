import type { db } from '../prisma/db.js';

export type UserClient = typeof db.orm.public.User;
export type UserFilter = Parameters<UserClient['where']>[0];
export type UserQuery = ReturnType<UserClient['where']>;
export type UserRecord = NonNullable<Awaited<ReturnType<UserQuery['first']>>>;
export type UserUpdate = Parameters<UserQuery['update']>[0];

export type UserDatabase = {
  orm: {
    public: {
      User: {
        where(filters: UserFilter): Pick<UserQuery, 'first' | 'update'>;
      };
      RefreshToken?: {
        where(filters: Record<string, unknown>): {
          all(): Promise<{ id: string }[]>;
          update(data: Record<string, unknown>): Promise<unknown>;
        };
      };
    };
  };
};

export interface SafeUser {
  id: UserRecord['id'];
  name: UserRecord['name'];
  email: UserRecord['email'];
  role: UserRecord['role'];
  createdAt: UserRecord['createdAt'];
  updatedAt: UserRecord['updatedAt'];
}

export interface PasswordService {
  verify(plainText: string, encodedHash: string): Promise<boolean>;
  hash(plainText: string): Promise<string>;
}
