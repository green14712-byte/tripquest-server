#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6aa685336be2ac60ec8cc606737a51231eb75cd8510ab46b8a53dd09264adde7/contract';
import endContract from '../../snapshots/6aa685336be2ac60ec8cc606737a51231eb75cd8510ab46b8a53dd09264adde7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7dc545a36f87d55697bc0c451ec1edc05f0e0fbc6497a7ae279ad0d41978575c/contract';
import startContract from '../../snapshots/7dc545a36f87d55697bc0c451ec1edc05f0e0fbc6497a7ae279ad0d41978575c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'missions',
        column: col('status', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'missions',
        constraint: 'missions_status_check_ee520df2',
        expression: `"status" IN ('ACTIVE', 'INACTIVE')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
