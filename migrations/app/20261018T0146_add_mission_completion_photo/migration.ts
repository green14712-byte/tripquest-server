#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3bc8e143ac822c75ccd33664efafd5af1df48cfdc11a92507f7e4c9530d094bd/contract';
import startContract from '../../snapshots/3bc8e143ac822c75ccd33664efafd5af1df48cfdc11a92507f7e4c9530d094bd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/69eab1bce97cd6a4685bcc5dce16d4e5e204ab1299e2aa1f08a0f8e6dd31c6e2/contract';
import endContract from '../../snapshots/69eab1bce97cd6a4685bcc5dce16d4e5e204ab1299e2aa1f08a0f8e6dd31c6e2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'mission_completions',
        column: col('photoImageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
