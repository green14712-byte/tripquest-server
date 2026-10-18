#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8a4977b09068de05f701a996b80b5ac6396ce832b6617aec636f7ff0a96e7ad8/contract';
import endContract from '../../snapshots/8a4977b09068de05f701a996b80b5ac6396ce832b6617aec636f7ff0a96e7ad8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bfc2e4e0ff6d0c75e58d928c8933777e9bb1d5423105fccde40f5b58888fa7f3/contract';
import startContract from '../../snapshots/bfc2e4e0ff6d0c75e58d928c8933777e9bb1d5423105fccde40f5b58888fa7f3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'missions',
        column: col('verificationMode', 'text', {
          notNull: true,
          default: lit('LOCATION_AND_QR'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'mission_completions',
        column: col('verificationMethod', 'text', {
          default: lit('BOTH'),
          codecRef: { codecId: 'pg/text@1' },
        }),
        operationClass: 'widening',
      }),
      this.setDefault({
        schema: 'public',
        table: 'missions',
        column: col('qrActive', 'bool', {
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
        operationClass: 'widening',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'missions',
        constraint: 'missions_verificationMode_check_2b7ecb9d',
        expression: `"verificationMode" IN ('LOCATION_ONLY', 'LOCATION_AND_QR', 'LOCATION_OR_QR')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
