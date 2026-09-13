import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readSharedContent, readPhotoPage, messageLinks } from '../../src/messenger/shared-content';
import { localSchema, type LocalDatabase, type SQLValue } from '../../src/messenger/model';

test('shared content is conversation-scoped, paginates older media, classifies by MIME and never loads bytes', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(localSchema);
  const db = {
    all: async <T>(query: string, ...args: SQLValue[]) => sql.prepare(query).all(...args) as T[],
  } as LocalDatabase;
  for (const id of ['one', 'two'])
    sql
      .prepare("INSERT INTO chats(id,kind,title,owner) VALUES(?,'direct','Fixture','peer')")
      .run(id);
  const add = (id: string, chat: string, kind: string, body: string, mime?: string) => {
    if (mime)
      sql
        .prepare('INSERT INTO media VALUES(?,?,?,?,NULL)')
        .run(id, id + '.file', mime, 'PRIVATE_BYTES');
    sql
      .prepare(
        'INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,media_id) VALUES(?,?,?,?,?,1,1,?)',
      )
      .run(id, chat, 'peer', kind, body, mime ? id : null);
  };
  for (let i = 0; i < 43; i++) add('photo' + i, 'one', 'image', '', 'image/jpeg');
  add('otherPhoto', 'two', 'image', '', 'image/jpeg');
  add('video', 'one', 'file', '', 'video/mp4');
  add('pdf', 'one', 'file', '', 'application/pdf');
  add('voice', 'one', 'voice', '', 'audio/mp4');
  add('link', 'one', 'text', 'https://example.com/a https://example.org/b');
  add('otherLink', 'two', 'text', 'https://example.com/private');
  const first = await readSharedContent(db, 'one', 'media', Number.MAX_SAFE_INTEGER);
  assert.equal(first.items.length, 40);
  assert.equal(first.items[0]?.id, 'video');
  assert.ok(first.next);
  const second = await readSharedContent(db, 'one', 'media', first.next!);
  assert.equal(second.items.length, 4);
  assert.equal(second.next, undefined);
  assert.equal(new Set([...first.items, ...second.items].map((x) => x.id)).size, 44);
  assert.ok(!JSON.stringify(first).includes('PRIVATE_BYTES'));
  assert.deepEqual(
    (await readSharedContent(db, 'one', 'docs', Number.MAX_SAFE_INTEGER)).items.map((x) => x.id),
    ['pdf'],
  );
  assert.equal(
    (await readSharedContent(db, 'one', 'links', Number.MAX_SAFE_INTEGER)).items.length,
    2,
  );
  const before = await readPhotoPage(db, 'one', Number.MAX_SAFE_INTEGER, 'before');
  assert.equal(before.items.length, 40);
  assert.equal(before.items[0]?.id, 'photo42');
  const earlier = await readPhotoPage(db, 'one', before.next!, 'before');
  assert.equal(earlier.items.length, 3);
  const after = await readPhotoPage(db, 'one', earlier.items[0]!.sequence, 'after');
  assert.equal(after.items.length, 40);
  assert.equal(after.items[0]?.id, 'photo3');
  assert.ok(!JSON.stringify(after).includes('PRIVATE_BYTES'));
  assert.ok(!after.items.some((item) => ['video', 'pdf', 'otherPhoto'].includes(item.id)));
  await assert.rejects(readPhotoPage(db, 'one', NaN, 'before'));
  await assert.rejects(readPhotoPage(db, 'one', 1, 'invalid' as 'after'));
  // Invalid link candidates must not hide an older valid link behind an empty page.
  for (let i = 0; i < 40; i++) add('invalid' + i, 'one', 'text', 'https://');
  const invalid = await readSharedContent(db, 'one', 'links', Number.MAX_SAFE_INTEGER);
  assert.equal(invalid.items.length, 0);
  assert.ok(invalid.next);
  assert.equal((await readSharedContent(db, 'one', 'links', invalid.next!)).items.length, 2);
  sql.prepare('DELETE FROM messages WHERE chat_id=?').run('one');
  assert.equal(
    (await readSharedContent(db, 'one', 'media', Number.MAX_SAFE_INTEGER)).items.length,
    0,
  );
  assert.equal(
    (await readSharedContent(db, 'two', 'media', Number.MAX_SAFE_INTEGER)).items.length,
    1,
  );
  sql.close();
});

test('link extraction accepts only explicit HTTP(S), strips prose punctuation and rejects embedded credentials', () => {
  assert.deepEqual(
    messageLinks(
      'Read (https://example.com/a), https://example.com/a. https://example.org/wiki/A_(B).',
    ),
    ['https://example.com/a', 'https://example.org/wiki/A_(B)'],
  );
  assert.deepEqual(
    messageLinks('javascript:alert(1) file:///local https://user:secret@example.com https://'),
    [],
  );
});
