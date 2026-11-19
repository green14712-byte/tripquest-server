#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4eb8a1b5b16050608fef084b5ff563db60f5cb64da74407923f38acb98a67f8c/contract';
import startContract from '../../snapshots/4eb8a1b5b16050608fef084b5ff563db60f5cb64da74407923f38acb98a67f8c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5fb318aa24e0374406527be1fdd9294a54709b91f4d2bb4cba3805a7d6587bbe/contract';
import endContract from '../../snapshots/5fb318aa24e0374406527be1fdd9294a54709b91f4d2bb4cba3805a7d6587bbe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'challenges',
        column: col('routeMode', 'text', {
          notNull: true,
          default: lit('WALKING'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'challenges',
        constraint: 'challenges_routeMode_check_95e5293e',
        expression: `"routeMode" IN ('WALKING', 'CYCLING', 'DRIVING')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
