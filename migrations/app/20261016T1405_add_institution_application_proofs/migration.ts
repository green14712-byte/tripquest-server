#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1caf68d726c02ee7b3993fb1a7dffeb19b5a48dd0ff8c801a022f2258fb9d9c0/contract';
import startContract from '../../snapshots/1caf68d726c02ee7b3993fb1a7dffeb19b5a48dd0ff8c801a022f2258fb9d9c0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a569c5443cb321c3d0de17e26f1c5df757050e60bd1fb3c9d308cc636fa63242/contract';
import endContract from '../../snapshots/a569c5443cb321c3d0de17e26f1c5df757050e60bd1fb3c9d308cc636fa63242/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'institution_application_proofs',
        columns: [
          col('applicationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('fileKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fileSize', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mimeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('originalName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'institution_application_proofs',
        constraint: 'institution_application_proofs_fileKey_key',
        columns: ['fileKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'institution_application_proofs',
        index: 'institution_application_proofs_applicationId_idx_8158f91a',
        columns: ['applicationId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'institution_application_proofs',
        foreignKey: {
          name: 'institution_application_proofs_applicationId_fkey',
          columns: ['applicationId'],
          references: { schema: 'public', table: 'institution_applications', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
