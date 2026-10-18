#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/62df61116168500c06033b7c033ff5bb56c6f256d2beeb1d2db6f040419ce21d/contract';
import startContract from '../../snapshots/62df61116168500c06033b7c033ff5bb56c6f256d2beeb1d2db6f040419ce21d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a671625b7b521e8f5b7cd7a8056dae7e0a08985c9cef51820e3a8b8d7e3c4012/contract';
import endContract from '../../snapshots/a671625b7b521e8f5b7cd7a8056dae7e0a08985c9cef51820e3a8b8d7e3c4012/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'missions',
        column: col('photoPositionX', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'missions',
        column: col('photoPositionY', 'float8', {
          notNull: true,
          default: lit(50),
          codecRef: { codecId: 'pg/float8@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
