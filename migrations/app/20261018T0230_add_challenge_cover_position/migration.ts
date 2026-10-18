#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/62df61116168500c06033b7c033ff5bb56c6f256d2beeb1d2db6f040419ce21d/contract';
import endContract from '../../snapshots/62df61116168500c06033b7c033ff5bb56c6f256d2beeb1d2db6f040419ce21d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/69eab1bce97cd6a4685bcc5dce16d4e5e204ab1299e2aa1f08a0f8e6dd31c6e2/contract';
import startContract from '../../snapshots/69eab1bce97cd6a4685bcc5dce16d4e5e204ab1299e2aa1f08a0f8e6dd31c6e2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('coverPositionX', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('coverPositionY', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
