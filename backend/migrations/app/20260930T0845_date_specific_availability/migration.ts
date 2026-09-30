#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/546ebb1d1bf0c8e7200ff5f2f8cd21836307622c72ca7539b92c766a7431bc5e/contract';
import startContract from '../../snapshots/546ebb1d1bf0c8e7200ff5f2f8cd21836307622c72ca7539b92c766a7431bc5e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/999f721e81b7177357bb4968db50328e39efbe93db624eb64bb4e6d25b9bc790/contract';
import endContract from '../../snapshots/999f721e81b7177357bb4968db50328e39efbe93db624eb64bb4e6d25b9bc790/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'mate_availability_date_override_slots',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endTime', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('overrideId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
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
        table: 'mate_availability_date_overrides',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mateId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mate_availability_date_override_slots',
        constraint: 'mate_avail_date_slots_unique',
        columns: ['overrideId', 'startTime', 'endTime'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mate_availability_date_overrides',
        constraint: 'mate_avail_overrides_date_unique',
        columns: ['mateId', 'date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate_availability_date_override_slots',
        index: 'mate_avail_override_slots_override_idx',
        columns: ['overrideId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mate_availability_date_overrides',
        index: 'mate_availability_date_overrides_mateId_idx_99af79ac',
        columns: ['mateId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate_availability_date_override_slots',
        foreignKey: {
          name: 'mate_availability_date_override_slots_overrideId_fkey',
          columns: ['overrideId'],
          references: {
            schema: 'public',
            table: 'mate_availability_date_overrides',
            columns: ['id'],
          },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mate_availability_date_overrides',
        foreignKey: {
          name: 'mate_availability_date_overrides_mateId_fkey',
          columns: ['mateId'],
          references: { schema: 'public', table: 'mate', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
