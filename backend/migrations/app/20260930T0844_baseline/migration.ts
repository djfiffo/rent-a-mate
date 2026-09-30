#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/546ebb1d1bf0c8e7200ff5f2f8cd21836307622c72ca7539b92c766a7431bc5e/contract';
import endContract from '../../snapshots/546ebb1d1bf0c8e7200ff5f2f8cd21836307622c72ca7539b92c766a7431bc5e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'activity',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'booking',
        columns: [
          col('activityId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endTime', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('renterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startTime', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('totalPrice', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'booking_status_check_e791946a',
            "\"status\" IN ('pending', 'confirmed', 'completed', 'cancelled')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'districts',
        columns: [
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provinceId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'interest',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mate',
        columns: [
          col('age', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deactiveAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('districtId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('hourlyRate', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('profileImageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profileImageUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provinceId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mateActivity',
        columns: [
          col('activityId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['mateId', 'activityId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mateAvailability',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dayOfWeek', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('endTime', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startTime', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mateInterest',
        columns: [
          col('interestId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['mateId', 'interestId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mate_photos',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sortOrder', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('storageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'messages',
        columns: [
          col('bookingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('clientMessageId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('readAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('senderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'notifications',
        columns: [
          col('bookingId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRead', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'notifications_type_check_96cafc4a',
            "\"type\" IN ('booking_requested', 'booking_confirmed', 'booking_declined', 'booking_cancelled', 'booking_completed', 'payment_paid', 'payment_failed', 'payment_refunded', 'message_received', 'report_resolved')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'payment',
        columns: [
          col('amount', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('bookingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('failedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('paidAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('providerReference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refundedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'payment_status_check_f96b3e71',
            "\"status\" IN ('pending', 'paid', 'failed', 'refunding', 'refunded')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'provinces',
        columns: [
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'refresh_tokens',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('jti', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('replacedByJti', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'reports',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reporterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('resolutionNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('resolvedById', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('open'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('targetId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('targetType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'reports_status_check_517eeb58',
            "\"status\" IN ('open', 'reviewed', 'dismissed', 'actioned')",
          ),
          checkExpression(
            'reports_targetType_check_14f7bc86',
            "\"targetType\" IN ('user', 'mate', 'booking', 'review', 'message')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'review',
        columns: [
          col('bookingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('comment', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rating', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('renterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'stripeWebhookEvent',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('processedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('banReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bannedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deactivatedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isBanned', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isVerified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('verifiedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('user_role_check_b72e2d35', "\"role\" IN ('admin', 'mate', 'renter')"),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'activity',
        constraint: 'activity_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'districts',
        constraint: 'districts_provinceId_name_key',
        columns: ['provinceId', 'name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'interest',
        constraint: 'interest_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mate',
        constraint: 'mate_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mateAvailability',
        constraint: 'mateAvailability_mateId_dayOfWeek_startTime_endTime_key',
        columns: ['mateId', 'dayOfWeek', 'startTime', 'endTime'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mate_photos',
        constraint: 'mate_photos_mateId_sortOrder_key',
        columns: ['mateId', 'sortOrder'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'messages',
        constraint: 'messages_senderId_clientMessageId_key',
        columns: ['senderId', 'clientMessageId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'payment',
        constraint: 'payment_bookingId_key',
        columns: ['bookingId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'payment',
        constraint: 'payment_providerReference_key',
        columns: ['providerReference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'provinces',
        constraint: 'provinces_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'refresh_tokens',
        constraint: 'refresh_tokens_jti_key',
        columns: ['jti'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'review',
        constraint: 'review_bookingId_key',
        columns: ['bookingId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_mateId_date_status_idx_3b43df3b',
        columns: ['mateId', 'date', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_renterId_createdAt_idx_63c3c59b',
        columns: ['renterId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_renterId_idx_e98d17a1',
        columns: ['renterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'booking',
        index: 'booking_status_date_idx_f5d04248',
        columns: ['status', 'date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'districts',
        index: 'districts_provinceId_idx_a419a0e2',
        columns: ['provinceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate',
        index: 'mate_districtId_idx_a3818dd3',
        columns: ['districtId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate',
        index: 'mate_hourlyRate_idx_da888ad6',
        columns: ['hourlyRate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate',
        index: 'mate_isActive_provinceId_idx_059e7fd8',
        columns: ['isActive', 'provinceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate',
        index: 'mate_provinceId_idx_a419a0e2',
        columns: ['provinceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mateActivity',
        index: 'mateActivity_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mateActivity',
        index: 'mateActivity_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mateAvailability',
        index: 'mateAvailability_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mateInterest',
        index: 'mateInterest_interestId_idx_ef155ccd',
        columns: ['interestId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mateInterest',
        index: 'mateInterest_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate_photos',
        index: 'mate_photos_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'messages',
        index: 'messages_bookingId_createdAt_idx_b0a32e18',
        columns: ['bookingId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'messages',
        index: 'messages_bookingId_idx_17848f4a',
        columns: ['bookingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'messages',
        index: 'messages_senderId_idx_4689c490',
        columns: ['senderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_bookingId_idx_17848f4a',
        columns: ['bookingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_userId_isRead_createdAt_idx_33778255',
        columns: ['userId', 'isRead', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payment',
        index: 'payment_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_tokens',
        index: 'refresh_tokens_userId_expiresAt_idx_9721b56d',
        columns: ['userId', 'expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refresh_tokens',
        index: 'refresh_tokens_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reports',
        index: 'reports_reporterId_createdAt_idx_468b5f4f',
        columns: ['reporterId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reports',
        index: 'reports_reporterId_idx_aa245831',
        columns: ['reporterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reports',
        index: 'reports_resolvedById_idx_fc75edc7',
        columns: ['resolvedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reports',
        index: 'reports_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reports',
        index: 'reports_targetType_targetId_idx_7a5ee9cb',
        columns: ['targetType', 'targetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'review',
        index: 'review_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'review',
        index: 'review_renterId_idx_e98d17a1',
        columns: ['renterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user',
        index: 'user_isActive_isBanned_idx_e0b27a9f',
        columns: ['isActive', 'isBanned'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user',
        index: 'user_role_createdAt_idx_174bf716',
        columns: ['role', 'createdAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'booking',
        foreignKey: {
          name: 'booking_renterId_fkey',
          columns: ['renterId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'booking',
        foreignKey: {
          name: 'booking_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'booking',
        foreignKey: {
          name: 'booking_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'activity', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'districts',
        foreignKey: {
          name: 'districts_provinceId_fkey',
          columns: ['provinceId'],
          references: { schema: 'public', table: 'provinces', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate',
        foreignKey: {
          name: 'mate_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate',
        foreignKey: {
          name: 'mate_provinceId_fkey',
          columns: ['provinceId'],
          references: { schema: 'public', table: 'provinces', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate',
        foreignKey: {
          name: 'mate_districtId_fkey',
          columns: ['districtId'],
          references: { schema: 'public', table: 'districts', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mateActivity',
        foreignKey: {
          name: 'mateActivity_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mateActivity',
        foreignKey: {
          name: 'mateActivity_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'activity', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mateAvailability',
        foreignKey: {
          name: 'mateAvailability_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mateInterest',
        foreignKey: {
          name: 'mateInterest_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mateInterest',
        foreignKey: {
          name: 'mateInterest_interestId_fkey',
          columns: ['interestId'],
          references: { schema: 'public', table: 'interest', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate_photos',
        foreignKey: {
          name: 'mate_photos_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'messages',
        foreignKey: {
          name: 'messages_bookingId_fkey',
          columns: ['bookingId'],
          references: { schema: 'public', table: 'booking', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'messages',
        foreignKey: {
          name: 'messages_senderId_fkey',
          columns: ['senderId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_bookingId_fkey',
          columns: ['bookingId'],
          references: { schema: 'public', table: 'booking', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payment',
        foreignKey: {
          name: 'payment_bookingId_fkey',
          columns: ['bookingId'],
          references: { schema: 'public', table: 'booking', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'refresh_tokens',
        foreignKey: {
          name: 'refresh_tokens_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reports',
        foreignKey: {
          name: 'reports_reporterId_fkey',
          columns: ['reporterId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reports',
        foreignKey: {
          name: 'reports_resolvedById_fkey',
          columns: ['resolvedById'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'review',
        foreignKey: {
          name: 'review_bookingId_fkey',
          columns: ['bookingId'],
          references: { schema: 'public', table: 'booking', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'review',
        foreignKey: {
          name: 'review_renterId_fkey',
          columns: ['renterId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'review',
        foreignKey: {
          name: 'review_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
