#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0a863a264fc5671fe881bac257b166f4bd87c212e3d2423090372dcbcdc02c74/contract';
import endContract from '../../snapshots/0a863a264fc5671fe881bac257b166f4bd87c212e3d2423090372dcbcdc02c74/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e6dd16de69c7c985ae99ef28e59360940997e26de817e942ccc9663b313508b2/contract';
import startContract from '../../snapshots/e6dd16de69c7c985ae99ef28e59360940997e26de817e942ccc9663b313508b2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'challenge_reviews',
        columns: [
          col('challengeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('comment', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rating', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'challenge_reviews',
        constraint: 'challenge_reviews_userId_challengeId_key',
        columns: ['userId', 'challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_reviews',
        index: 'challenge_reviews_challengeId_createdAt_idx_f13d71b2',
        columns: ['challengeId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_reviews',
        index: 'challenge_reviews_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_reviews',
        index: 'challenge_reviews_challengeId_rating_idx_6b836fbc',
        columns: ['challengeId', 'rating'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'challenge_reviews',
        index: 'challenge_reviews_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenge_reviews',
        foreignKey: {
          name: 'challenge_reviews_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'challenge_reviews',
        foreignKey: {
          name: 'challenge_reviews_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'challenges', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
