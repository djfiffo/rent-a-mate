/**
 * Compatibility surface for older callers. Moderation state is persisted on
 * User now; this module intentionally does not retain process-local state.
 * Services and guards must query User.isBanned/isActive/isVerified directly.
 */
import type { Temporal } from '@js-temporal/polyfill';

export interface BanRecord {
  userId: number;
  reason: string;
  bannedAt: Temporal.Instant;
  bannedBy: number;
}

/** @deprecated Persist moderation changes through AdminService. */
export const banUserRecord = (_record: BanRecord): void => undefined;
/** @deprecated Persist moderation changes through AdminService. */
export const unbanUserRecord = (_userId: number): boolean => false;
/** @deprecated Read moderation state from User. */
export const isUserBanned = (_userId: number): boolean => false;
/** @deprecated Ban metadata is persisted on User. */
export const getBanRecord = (_userId: number): BanRecord | undefined =>
  undefined;
/** @deprecated Persist moderation changes through AdminService. */
export const activateUserRecord = (_userId: number): void => undefined;
/** @deprecated Persist moderation changes through AdminService. */
export const deactivateUserRecord = (_userId: number): void => undefined;
/** @deprecated Read moderation state from User. */
export const isUserActive = (_userId: number): boolean => true;
/** @deprecated Persist moderation changes through AdminService. */
export const verifyUserRecord = (_userId: number): void => undefined;
/** @deprecated Persist moderation changes through AdminService. */
export const unverifyUserRecord = (_userId: number): void => undefined;
/** @deprecated Read moderation state from User. */
export const isUserVerified = (_userId: number): boolean => false;
/** @deprecated No process-local state remains. */
export const clearModerationRecords = (): void => undefined;
export const clearBanRecords = clearModerationRecords;
