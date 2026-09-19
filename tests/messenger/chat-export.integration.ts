import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ContactView } from '../../src/messenger/contact-view';
import { createKeys } from '../../src/messenger/crypto';
import { createChatExport, exportAttachmentPath } from '../../src/messenger/chat-export';
import { ExportZip } from '../../src/messenger/export-zip';
import { richMedia } from '../../src/messenger/rich-message';
import { deliveryDatabase } from './delivery-fixture';

async function fixture() {
  const storage = deliveryDatabase();
  const engine = new DeviceMessenger(storage.db, randomBytes, randomUUID, () => 12345);
  await engine.initialize();
  const own = await engine.createIdentity('Me');
  const peer = { key: createKeys(randomBytes).key, name: 'Profile name' };
  const chat = await engine.trustContact(peer);
  const view = new ContactView(engine, new Map([[peer.key, 'ნინო <friend> 💚']]));
  return { storage, engine, own, peer, chat, view, close: () => engine.close() };
}
function extract(chunks: readonly Uint8Array[]) {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-export-'));
  try {
    const path = join(directory, 'chat.zip');
    writeFileSync(path, Buffer.concat(chunks));
    // Independent standard ZIP implementation verifies CRCs and extracts entries.
    return JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `
import sys,zipfile,json,base64
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert len(z.namelist()) == len(set(z.namelist()))
 z.extractall(sys.argv[2])
 print(json.dumps({name:base64.b64encode(z.read(name)).decode() for name in z.namelist()}))
`,
          path,
          join(directory, 'extracted'),
        ],
        { encoding: 'utf8', maxBuffer: 20_000_000 },
      ),
    ) as Record<string, string>;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const decoded = (files: Record<string, string>, path: string) =>
  Buffer.from(files[path]!, 'base64').toString('utf8');

test('unchanged native dictionary rows export despite different property enumeration on every pass', async () => {
  const f = await fixture();
  try {
    await f.engine.send(f.chat, 'უცვლელი ტექსტი https://example.org/place', {
      deferDelivery: true,
    });
    await f.engine.send(f.chat, 'Photo', {
      kind: 'image',
      media: { name: 'photo.png', mime: 'image/png', bytes: 'cGhvdG8=', duration: null },
      deferDelivery: true,
    });
    const read = f.engine.exportPage.bind(f.engine);
    let pass = 0;
    f.engine.exportPage = async (...args) => {
      const rows = await read(...args);
      // Swift [String: Any] dictionaries do not promise SQL-column key order.
      const shift = ++pass;
      return rows.map((row) => {
        const entries = Object.entries(row);
        return Object.fromEntries([
          ...entries.slice(shift % entries.length),
          ...entries.slice(0, shift % entries.length),
        ]) as typeof row;
      });
    };
    const chunks: Uint8Array[] = [];
    const result = await createChatExport(f.engine, f.view, f.chat, {
      write: (chunk) => {
        chunks.push(chunk.slice());
      },
    });
    assert.equal(result.messages, 2);
    assert.equal(result.attachments, 1);
    const files = extract(chunks);
    assert.ok(decoded(files, 'Chat.html').includes('უცვლელი ტექსტი'));
    assert.ok(decoded(files, 'Links/index.html').includes('https://example.org/place'));
    assert.equal(decoded(files, 'Media/2-photo.png'), 'photo');
  } finally {
    await f.close();
  }
});

test('export streams every bounded page in chronological order, aliases and complete UTF-8 HTML; live arrivals excluded', async () => {
  const f = await fixture();
  try {
    const expected: { sequence: number; sentAt: number; body: string }[] = [];
    for (let index = 0; index < 305; index++) {
      const sentAt = 1000 + ((index * 17) % 93);
      const body = `მესიჯი-${index}-💚`;
      await f.storage.db.run(
        'INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,is_read) VALUES(?,?,?,?,?,?,?,1)',
        randomUUID(),
        f.chat,
        f.peer.key,
        'text',
        body,
        sentAt,
        sentAt,
      );
      expected.push({ sequence: index + 1, sentAt, body });
    }
    expected.sort((a, b) => a.sentAt - b.sentAt || a.sequence - b.sequence);
    const chunks: Uint8Array[] = [];
    let inserted = false,
      largest = 0;
    const result = await createChatExport(f.engine, f.view, f.chat, {
      write: async (chunk) => {
        largest = Math.max(largest, chunk.length);
        chunks.push(chunk.slice());
        if (!inserted) {
          inserted = true;
          await f.engine.send(f.chat, 'LIVE ARRIVAL MUST NOT BE EXPORTED', { deferDelivery: true });
        }
      },
      generatedAt: 20000,
    });
    assert.equal(result.messages, 305);
    assert.equal(
      result.bytes,
      chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    );
    assert.ok(largest <= 65536);
    const files = extract(chunks),
      html = decoded(files, 'Chat.html');
    assert.deepEqual(Object.keys(files), [
      'Media/',
      'Links/',
      'Documents/',
      'Chat.html',
      'Links/index.html',
    ]);
    const articles = [...html.matchAll(/<article id="m-(\d+)">/g)].map((match) => Number(match[1]));
    assert.deepEqual(
      articles,
      expected.map((row) => row.sequence),
    );
    for (const message of expected) assert.ok(html.includes(message.body));
    assert.ok(html.includes('ნინო &lt;friend&gt; 💚'));
    assert.ok(!html.includes(f.peer.key));
    assert.ok(!html.includes('LIVE ARRIVAL'));
    assert.ok(!html.includes('<script'));
  } finally {
    await f.close();
  }
});

test('ZIP contains local attachment bytes with safe unique paths, offline relative links, escaped content and readable message types', async () => {
  const f = await fixture();
  try {
    const dangerous = '<script>alert(1)</script> & "quoted"';
    const id = await f.engine.send(
      f.chat,
      dangerous +
        '\nhttps://example.org/hello?q="quoted" javascript:alert(1) https://user:password@example.org/ https://example.org/ქართული',
      { deferDelivery: true },
    );
    const reply = await f.engine.send(f.chat, 'Reply', { replyTo: id, deferDelivery: true });
    const data = randomBytes(180_000);
    for (const name of ['../../ფოტო 😃.png', '../../ფოტო 😃.png'])
      await f.engine.send(f.chat, 'Caption', {
        kind: 'image',
        media: { name, mime: 'image/png', bytes: data.toString('base64'), duration: null },
        deferDelivery: true,
      });
    await f.engine.send(f.chat, 'Document', {
      kind: 'file',
      media: {
        name: '../dangerous.html',
        mime: 'text/html',
        bytes: Buffer.from(dangerous).toString('base64'),
        duration: null,
      },
      deferDelivery: true,
    });
    await f.engine.send(f.chat, 'Poll', {
      kind: 'file',
      media: richMedia({
        version: 1,
        type: 'poll',
        question: 'Dinner?',
        options: ['ხაჭაპური', 'Soup'],
        multiple: false,
      }),
      deferDelivery: true,
    });
    await f.engine.send(f.chat, 'Tbilisi\n41.7,44.8', { kind: 'location', deferDelivery: true });
    await f.engine.send(f.chat, `Old name\nmnelo1:${f.peer.key}`, {
      kind: 'contact',
      deferDelivery: true,
    });
    const absent = await f.engine.send(f.chat, 'Missing photo', {
      kind: 'image',
      deferDelivery: true,
    });
    await f.storage.db.run('UPDATE messages SET edited_at=14000 WHERE id=?', reply);
    await f.storage.db.run(
      'INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,is_read) VALUES(?,?,?,?,?,?,?,1)',
      randomUUID(),
      f.chat,
      f.peer.key,
      'call',
      'video:incoming:declined',
      15000,
      15000,
    );
    await f.storage.db.run(
      'INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,is_read) VALUES(?,?,?,?,?,?,?,1)',
      randomUUID(),
      f.chat,
      f.peer.key,
      'deleted',
      'MUST NOT LEAK DELETED BODY',
      16000,
      16000,
    );
    const chunks: Uint8Array[] = [],
      sizes: number[] = [];
    const result = await createChatExport(f.engine, f.view, f.chat, {
      write: (chunk) => {
        chunks.push(chunk.slice());
        sizes.push(chunk.length);
      },
    });
    assert.equal(result.attachments, 4);
    assert.equal(result.missingAttachments, 1);
    assert.ok(Math.max(...sizes) <= 65536);
    const files = extract(chunks),
      html = decoded(files, 'Chat.html'),
      links = decoded(files, 'Links/index.html');
    const images = Object.keys(files).filter(
      (path) => path.startsWith('Media/') && path.endsWith('.png'),
    );
    assert.equal(images.length, 2);
    assert.notEqual(images[0], images[1]);
    for (const image of images) assert.deepEqual(Buffer.from(files[image]!, 'base64'), data);
    for (const path of Object.keys(files)) {
      assert.ok(!path.startsWith('/') && !path.includes('\\'));
      assert.ok(!path.split('/').includes('..'));
    }
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;'));
    assert.ok(html.includes('href="#m-1"'));
    assert.ok(html.includes('Edited 1970-01-01'));
    assert.ok(html.includes('Video call · incoming · declined'));
    assert.ok(html.includes('This message was deleted.'));
    assert.ok(!html.includes('MUST NOT LEAK DELETED BODY'));
    assert.ok(html.includes('Poll: Dinner?\n1. ხაჭაპური\n2. Soup'));
    assert.ok(html.includes('Location\nTbilisi'));
    assert.ok(html.includes('Contact\nნინო &lt;friend&gt; 💚'));
    assert.ok(!html.includes(f.peer.key));
    assert.ok(html.includes('Attachment unavailable on this device.'));
    assert.ok(!html.includes(`id="${absent}"`));
    assert.ok(!html.includes('<iframe') && !html.includes('<script') && !html.includes('<object'));
    assert.ok(!html.includes('href="javascript:') && !links.includes('user:password@'));
    assert.ok(links.includes('href="https://example.org/hello?q="'));
    assert.ok(links.includes('href="../Chat.html#m-1"'));
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((match) => decodeURIComponent(match[1]!));
    assert.deepEqual(srcs, images);
  } finally {
    await f.close();
  }
});

test('export refuses path traversal and duplicate ZIP names, checks cancellation per chunk, and fails rather than silently completing', async () => {
  const chunks: Uint8Array[] = [];
  const zip = new ExportZip((chunk) => {
    chunks.push(chunk.slice());
  });
  for (const path of [
    '../escape',
    '/absolute',
    'Media/../escape',
    'Media//file',
    'C:\\file',
    'file\0name',
  ])
    await assert.rejects(zip.add(path, []), /EXPORT_PATH_INVALID/);
  await zip.add('safe', [new Uint8Array([1, 2, 3])]);
  await assert.rejects(zip.add('safe', []), /EXPORT_PATH_INVALID/);
  await zip.finish();
  assert.equal(decoded(extract(chunks), 'safe'), '\x01\x02\x03');
  assert.equal(
    exportAttachmentPath({ sequence: 1, name: '../../hello\0.pdf', mime: 'application/pdf' }),
    'Documents/1-_.._hello_.pdf',
  );
  const f = await fixture();
  try {
    await f.engine.send(f.chat, 'Large', {
      kind: 'file',
      media: {
        name: 'file.dat',
        mime: 'application/octet-stream',
        bytes: randomBytes(200_000).toString('base64'),
        duration: null,
      },
      deferDelivery: true,
    });
    let bytes = 0;
    await assert.rejects(
      createChatExport(f.engine, f.view, f.chat, {
        write: (chunk) => {
          bytes += chunk.length;
        },
        checkCancelled: () => {
          if (bytes > 70000) throw new Error('EXPORT_CANCELLED');
        },
      }),
      /EXPORT_CANCELLED/,
    );
    assert.ok(bytes < 140000, 'cancellation is checked between <=64 KiB writes');
  } finally {
    await f.close();
  }
});

test('ZIP format bounds reject oversized UTF-8 names and failed sinks cannot be finalized', async () => {
  const zip = new ExportZip(() => undefined);
  await assert.rejects(zip.add('💚'.repeat(16384), []), /EXPORT_TOO_LARGE/);
  let calls = 0;
  const failed = new ExportZip(() => {
    if (++calls === 3) throw new Error('DISK_FULL');
  });
  await assert.rejects(failed.add('Document.txt', [new Uint8Array([1, 2, 3])]), /DISK_FULL/);
  await assert.rejects(failed.finish(), /EXPORT_STATE_INVALID/);
});

test('concurrent deletion or edit after attachment copying cannot complete an inconsistent archive; receipt updates remain harmless', async () => {
  for (const change of ['delete', 'edit', 'receipt'] as const) {
    const f = await fixture();
    try {
      const id = await f.engine.send(f.chat, 'Original caption', {
        kind: 'image',
        media: {
          name: 'photo.png',
          mime: 'image/png',
          bytes: Buffer.from('photo bytes').toString('base64'),
          duration: null,
        },
        deferDelivery: true,
      });
      const text = await f.engine.send(f.chat, 'Original text', { deferDelivery: true });
      const chunks: Uint8Array[] = [];
      let changed = false;
      const result = createChatExport(f.engine, f.view, f.chat, {
        write: async (chunk) => {
          chunks.push(chunk.slice());
          // The transcript local header is written only after every attachment.
          if (!changed && Buffer.from(chunk).toString('utf8') === 'Chat.html') {
            changed = true;
            if (change === 'delete') {
              await f.storage.db.run(
                "UPDATE messages SET kind='deleted',body='',media_id=NULL WHERE id=?",
                id,
              );
              await f.storage.db.run('DELETE FROM media WHERE id=?', id);
            } else if (change === 'edit') {
              await f.storage.db.run(
                'UPDATE messages SET body=?,edited_at=? WHERE id=?',
                'Changed text',
                20000,
                text,
              );
            } else {
              await f.engine.receive(f.peer.key, { type: 'ack', id });
            }
          }
        },
      });
      if (change === 'receipt') {
        assert.equal((await result).attachments, 1);
        assert.ok(decoded(extract(chunks), 'Chat.html').includes('Original text'));
      } else {
        await assert.rejects(result, /EXPORT_CHANGED/);
        assert.ok(
          !Buffer.concat(chunks).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])),
          'failed export has no completed ZIP central directory',
        );
      }
      assert.ok(changed);
    } finally {
      await f.close();
    }
  }
});
