#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9a5c64df38d920fa3a845cb5a0ef07dff33cebd8e2145be425c754bf0f986ac4/contract';
import startContract from '../../snapshots/9a5c64df38d920fa3a845cb5a0ef07dff33cebd8e2145be425c754bf0f986ac4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e6dd16de69c7c985ae99ef28e59360940997e26de817e942ccc9663b313508b2/contract';
import endContract from '../../snapshots/e6dd16de69c7c985ae99ef28e59360940997e26de817e942ccc9663b313508b2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'badge_versions',
        column: col('imagePositionX', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'badge_versions',
        column: col('imagePositionY', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'badge_versions',
        column: col('imageScale', 'float8', {
          notNull: true,
          default: lit(100),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeImagePositionX', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeImagePositionY', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('badgeImageScale', 'float8', {
          notNull: true,
          default: lit(100),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
