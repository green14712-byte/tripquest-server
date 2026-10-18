#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3dde559b066c5d057552b0c47882dc28462f7e0f544ec076b19860ebe8967690/contract';
import endContract from '../../snapshots/3dde559b066c5d057552b0c47882dc28462f7e0f544ec076b19860ebe8967690/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6aa685336be2ac60ec8cc606737a51231eb75cd8510ab46b8a53dd09264adde7/contract';
import startContract from '../../snapshots/6aa685336be2ac60ec8cc606737a51231eb75cd8510ab46b8a53dd09264adde7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('coverImageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
