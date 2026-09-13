import type { Temporal } from '@js-temporal/polyfill';

export interface BanRecord {
  userId: number;
  reason: string;
  bannedAt: Temporal.Instant;
  bannedBy: number;
}

const bannedUsers = new Map<number, BanRecord>();
const deactivatedUsers = new Set<number>();
const verifiedUsers = new Set<number>();

export const banUserRecord = (record: BanRecord): void => {
  bannedUsers.set(record.userId, record);
};

export const unbanUserRecord = (userId: number): boolean => {
  return bannedUsers.delete(userId);
};

export const isUserBanned = (userId: number): boolean => {
  return bannedUsers.has(userId);
};

export const getBanRecord = (userId: number): BanRecord | undefined => {
  return bannedUsers.get(userId);
};

export const activateUserRecord = (userId: number): void => {
  deactivatedUsers.delete(userId);
};

export const deactivateUserRecord = (userId: number): void => {
  deactivatedUsers.add(userId);
};

export const isUserActive = (userId: number): boolean => {
  return !deactivatedUsers.has(userId);
};

export const verifyUserRecord = (userId: number): void => {
  verifiedUsers.add(userId);
};

export const unverifyUserRecord = (userId: number): void => {
  verifiedUsers.delete(userId);
};

export const isUserVerified = (userId: number): boolean => {
  return verifiedUsers.has(userId);
};

export const clearModerationRecords = (): void => {
  bannedUsers.clear();
  deactivatedUsers.clear();
  verifiedUsers.clear();
};

export const clearBanRecords = clearModerationRecords;
