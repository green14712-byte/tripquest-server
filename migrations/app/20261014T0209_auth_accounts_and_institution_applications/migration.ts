#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9448082effe798e08c3b9c4cc57d336e96ea1eaa82a081755dd160be56a313c9/contract';
import startContract from '../../snapshots/9448082effe798e08c3b9c4cc57d336e96ea1eaa82a081755dd160be56a313c9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bfc2e4e0ff6d0c75e58d928c8933777e9bb1d5423105fccde40f5b58888fa7f3/contract';
import endContract from '../../snapshots/bfc2e4e0ff6d0c75e58d928c8933777e9bb1d5423105fccde40f5b58888fa7f3/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'email_verifications',
        columns: [
          col('attemptCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verificationTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verificationTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('verifiedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'institution_applications',
        columns: [
          col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('applicantId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('contactEmail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactPhone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('institutionName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('proofFileKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('rejectionReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('representativeName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reviewerId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('website', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'institution_applications_status_check_56005a61',
            `"status" IN ('PENDING', 'APPROVED', 'REJECTED')`,
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('deletedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('emailVerified', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('emailVerifiedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('googleSub', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('passwordHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('status', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('suspendedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('suspensionReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'email_verifications',
        constraint: 'email_verifications_email_key',
        columns: ['email'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_status_check_3a7c0f48',
        expression: `"status" IN ('ACTIVE', 'SUSPENDED', 'DELETED')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_googleSub_key',
        columns: ['googleSub'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'institution_applications',
        index: 'institution_applications_applicantId_idx_f3b3eac3',
        columns: ['applicantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'institution_applications',
        index: 'institution_applications_reviewerId_idx_25a27b4e',
        columns: ['reviewerId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'institution_applications',
        foreignKey: {
          name: 'institution_applications_applicantId_fkey',
          columns: ['applicantId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'institution_applications',
        foreignKey: {
          name: 'institution_applications_reviewerId_fkey',
          columns: ['reviewerId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
