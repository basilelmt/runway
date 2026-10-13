import type Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openReadOnly, runReadOnlyQuery } from '../src/ask/query';
import { openDb } from '../src/db/client';
import { createAccount } from '../src/repos/accounts';
import { createTransaction } from '../src/repos/transactions';

const dir = 'tmp/test-ask-query';
const path = `${dir}/runway.db`;
let ro: Database.Database;

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const db = openDb(path);
  const courant = createAccount(db, { name: 'Courant', initialBalance: 0, onBudget: true });
  for (let i = 0; i < 250; i++) createTransaction(db, { kind: 'expense', date: '2026-03-01', amount: 100 + i, label: `op ${i}`, accountId: courant.id });
  db.$client.close();
  ro = openReadOnly(path);
});
afterEach(() => {
  ro.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('runReadOnlyQuery', () => {
  it('lit et tronque à 200 lignes', () => {
    const all = runReadOnlyQuery(ro, 'select id, amount from transactions order by id');
    expect(all.rows).toHaveLength(200);
    expect(all.truncated).toBe(true);
    const sum = runReadOnlyQuery(ro, 'select sum(amount) as total, count(*) as n from transactions');
    expect(sum).toEqual({ rows: [{ total: 250 * 100 + (249 * 250) / 2, n: 250 }], truncated: false });
  });

  it('refuse toute écriture', () => {
    for (const sql of [
      "insert into accounts (name) values ('x')",
      "insert into accounts (name) values ('y') returning id",
      'with x as (select 1) delete from transactions',
      'update transactions set amount = 1',
      'delete from transactions',
      'drop table transactions',
      'create table x (a)',
      "attach database 'tmp/x.db' as x",
      'pragma query_only = off',
    ]) {
      expect(() => runReadOnlyQuery(ro, sql), sql).toThrow();
    }
    expect(runReadOnlyQuery(ro, 'select count(*) as n from transactions').rows[0]).toEqual({ n: 250 });
  });

  it('refuse plusieurs instructions et signale les erreurs SQL', () => {
    expect(() => runReadOnlyQuery(ro, 'select 1; delete from transactions')).toThrow();
    expect(() => runReadOnlyQuery(ro, 'select nope from transactions')).toThrow(/no such column/);
  });

  it('refuse les tables hors liste blanche, même cachées dans une sous-requête', () => {
    for (const sql of [
      'select * from settings',
      'select key from settings',
      'select (select count(*) from settings) as n',
      'with s as materialized (select * from settings) select * from s',
      'select * from transactions where id in (select id from bank_accounts)',
      'select iban from bank_accounts',
      'select session_id from bank_connections',
    ]) {
      expect(() => runReadOnlyQuery(ro, sql), sql).toThrow(/^Table non accessible : (settings|bank_accounts|bank_connections)$/);
    }
  });

  it('permet les tables de la liste blanche, jointures et lectures par index comprises', () => {
    expect(runReadOnlyQuery(ro, 'select count(*) as n from transactions t join accounts a on a.id = t.account_id').rows[0]).toEqual({ n: 250 });
    expect(runReadOnlyQuery(ro, "select count(*) as n from transactions where date >= '2026-01-01'").rows[0]).toEqual({ n: 250 });
    expect(runReadOnlyQuery(ro, "select count(*) as n from sqlite_schema where type = 'table'").rows[0]!.n).toBeGreaterThan(0);
    expect(runReadOnlyQuery(ro, 'select count(*) as n from envelopes e left join merchants m on 1 = 0').truncated).toBe(false);
  });
});
