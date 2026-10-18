#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7dc545a36f87d55697bc0c451ec1edc05f0e0fbc6497a7ae279ad0d41978575c/contract';
import endContract from '../../snapshots/7dc545a36f87d55697bc0c451ec1edc05f0e0fbc6497a7ae279ad0d41978575c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a569c5443cb321c3d0de17e26f1c5df757050e60bd1fb3c9d308cc636fa63242/contract';
import startContract from '../../snapshots/a569c5443cb321c3d0de17e26f1c5df757050e60bd1fb3c9d308cc636fa63242/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'missions',
        column: col('qrTokenEncrypted', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
