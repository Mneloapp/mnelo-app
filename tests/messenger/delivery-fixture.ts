import { DatabaseSync } from 'node:sqlite';
import type { DeliveryAtomic } from '../../src/messenger/delivery/journal';
import type { LocalDatabase, SQLValue } from '../../src/messenger/model';

export function deliveryDatabase(path = ':memory:') {
  const sql = new DatabaseSync(path);
  sql.exec('PRAGMA foreign_keys=ON');
  const db: LocalDatabase = {
    async exec(query) {
      sql.exec(query);
    },
    async run(query, ...params) {
      sql.prepare(query).run(...params);
    },
    async all<T>(query: string, ...params: SQLValue[]) {
      return sql.prepare(query).all(...params) as T[];
    },
    async close() {
      sql.close();
    },
  };
  let tail: Promise<unknown> = Promise.resolve(),
    fail = false;
  const atomic: DeliveryAtomic = <T>(work: (db: LocalDatabase) => Promise<T>) => {
    const result = tail.then(async () => {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const value = await work(db);
        if (fail) {
          fail = false;
          throw new Error('FIXTURE_COMMIT_FAILED');
        }
        sql.exec('COMMIT');
        return value;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    });
    tail = result.catch(() => undefined);
    return result;
  };
  return {
    sql,
    db,
    atomic,
    failCommit: () => {
      fail = true;
    },
  };
}
