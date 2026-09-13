import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'private media: photo, file, voice, location/contact, ownership and deletion',
  { timeout: 40000 },
  async () => {
    const a = await testUser(c, '0501'),
      b = await testUser(c, '0502'),
      other = await testUser(c, '0503');
    for (const [u, username] of [
      [a, 'dev_media_a'],
      [b, 'dev_media_b'],
      [other, 'dev_media_c'],
    ] as const) {
      assert.ok(!(await u.client.rpc('save_profile', { display_name: username, username })).error);
      await u.client.rpc('update_privacy', {
        discoverability: 'everyone',
        phone_visibility: 'nobody',
        request_audience: 'everyone',
      });
    }
    const request = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development media test',
    });
    assert.ok(request.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: request.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const conversation = accepted.data;
    const endpoint = c.url + '/functions/v1/chat-upload';
    async function upload(
      bytes: Uint8Array,
      mime: string,
      name: string,
      token = a.token,
      id = crypto.randomUUID(),
    ) {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: c.key,
          Authorization: 'Bearer ' + token,
          'content-type': mime,
          'x-conversation-id': conversation,
          'x-upload-id': id,
          'x-file-name': encodeURIComponent(name),
        },
        body: Uint8Array.from(bytes).buffer,
      });
    }
    const bytes = Uint8Array.from(
      jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 80).data,
    );
    const unauthorized = await upload(bytes, 'image/jpeg', 'photo.jpg', other.token);
    assert.equal(unauthorized.status, 403);
    const malformed = await upload(
      new TextEncoder().encode('<script>invalid</script>'),
      'image/jpeg',
      'photo.jpg',
    );
    assert.equal(malformed.status, 400);
    const sentIds: string[] = [];
    const paths: string[] = [];
    for (const [body, mime, name, kind] of [
      [bytes, 'image/jpeg', 'photo.jpg', 'image'],
      [new TextEncoder().encode('Development text file'), 'text/plain', 'notes.txt', 'file'],
      [
        new Uint8Array(readFileSync('tests/fixtures/development-tone.m4a')),
        'audio/mp4',
        'voice.m4a',
        'voice',
      ],
    ] as const) {
      const clientId = crypto.randomUUID();
      const response = await upload(body, mime, name, a.token, clientId);
      assert.equal(response.status, 200, 'Validated ' + kind + ' uploaded');
      const data = (await response.json()) as { attachmentId: string };
      assert.ok(data.attachmentId);
      const retry = await upload(body, mime, name, a.token, clientId);
      assert.equal(retry.status, 200);
      assert.equal(
        ((await retry.json()) as { attachmentId: string }).attachmentId,
        data.attachmentId,
        'Upload retry is idempotent',
      );
      const metadata = await a.client
        .from('message_attachments')
        .select('*')
        .eq('id', data.attachmentId)
        .single();
      assert.ok(metadata.data);
      paths.push(metadata.data.object_path);
      assert.deepEqual(
        (await b.client.from('message_attachments').select('file_name').eq('id', data.attachmentId))
          .data,
        [],
        'Unsent filename is private',
      );
      const beforeSend = await b.client.storage
        .from('chat-media')
        .createSignedUrl(metadata.data.object_path, 60);
      assert.ok(beforeSend.error, 'Recipient cannot access unsent attachment');
      const stolen = await b.client.rpc('send_attachment_message', {
        attachment: data.attachmentId,
        caption: '',
        client_id: crypto.randomUUID(),
      });
      assert.ok(stolen.error, 'Recipient cannot send another owner upload');
      const sent = await a.client.rpc('send_attachment_message', {
        attachment: data.attachmentId,
        caption: 'Development ' + kind,
        client_id: clientId,
      });
      assert.ok(!sent.error && sent.data, 'Attachment linked atomically');
      assert.equal(sent.data.kind, kind);
      const inbox = await b.client.rpc('list_conversations');
      assert.ok(!inbox.error);
      const summary = inbox.data?.find((item) => item.id === conversation);
      assert.equal(summary?.last_message_kind, kind);
      assert.equal(summary?.preview, 'Development ' + kind);
      sentIds.push(sent.data.id);
      const signed = await b.client.storage
        .from('chat-media')
        .createSignedUrl(metadata.data.object_path, 60);
      assert.ok(!signed.error && signed.data.signedUrl);
      assert.equal((await fetch(signed.data.signedUrl)).status, 200);
      const denied = await other.client.storage
        .from('chat-media')
        .createSignedUrl(metadata.data.object_path, 60);
      assert.ok(denied.error, 'Nonmember denied attachment');
      if (kind === 'voice')
        assert.ok(
          metadata.data.duration_seconds &&
            metadata.data.duration_seconds > 0 &&
            metadata.data.duration_seconds < 2,
          'Audio duration parsed server-side',
        );
    }
    const location = await a.client.rpc('send_location_message', {
      conversation,
      client_id: crypto.randomUUID(),
      latitude: 41.71,
      longitude: 44.76,
      label: 'Development location',
    });
    assert.ok(!location.error && location.data);
    assert.equal(
      (
        await b.client
          .from('message_locations')
          .select('latitude')
          .eq('message_id', location.data.id)
      ).data?.length,
      1,
      'Recipient sees explicitly shared point',
    );
    assert.deepEqual(
      (await other.client.from('message_locations').select('*').eq('message_id', location.data.id))
        .data,
      [],
      'Nonmember location denied',
    );
    const contact = await a.client.rpc('send_contact_message', {
      conversation,
      client_id: crypto.randomUUID(),
      contact: other.id,
    });
    assert.ok(!contact.error && contact.data, 'Mnelo contact shared');
    const card = await b.client.rpc('get_message_contacts', { message_ids: [contact.data.id] });
    assert.equal(
      card.data?.[0]?.display_name,
      'dev_media_c',
      'Shared contact label renders through the message-scoped projection',
    );
    assert.equal(card.data?.[0]?.username, 'dev_media_c');
    assert.deepEqual(
      (await other.client.rpc('get_message_contacts', { message_ids: [contact.data.id] })).data,
      [],
      'Contact subject cannot read an unrelated conversation',
    );
    assert.equal(
      (
        await b.client
          .from('message_contacts')
          .select('profile_id')
          .eq('message_id', contact.data.id)
      ).data?.[0]?.profile_id,
      other.id,
    );
    assert.ok(!(await other.client.rpc('block_user', { target: b.id })).error);
    assert.deepEqual(
      (await b.client.rpc('get_message_contacts', { message_ids: [contact.data.id] })).data,
      [],
      'Blocked contact identity is hidden',
    );
    assert.ok(!(await other.client.rpc('unblock_user', { target: b.id })).error);
    const forwarding = await fetch(c.url + '/functions/v1/chat-forward', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + b.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId: sentIds[0],
        conversationId: conversation,
        clientId: crypto.randomUUID(),
      }),
    });
    assert.equal(
      forwarding.status,
      200,
      'Recipient forwards an authorized photo with a private copy',
    );
    const forwarded = (await forwarding.json()) as { messageId: string };
    const forwardedMessage = await b.client
      .from('messages')
      .select('attachment_id,kind')
      .eq('id', forwarded.messageId)
      .single();
    assert.equal(forwardedMessage.data?.kind, 'image');
    const copied = await b.client
      .from('message_attachments')
      .select('object_path,user_id')
      .eq('id', forwardedMessage.data!.attachment_id!)
      .single();
    assert.equal(copied.data?.user_id, b.id, 'Forwarded copy has destination uploader ownership');
    if (copied.data) paths.push(copied.data.object_path);
    const forbiddenForward = await fetch(c.url + '/functions/v1/chat-forward', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + other.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId: sentIds[0],
        conversationId: conversation,
        clientId: crypto.randomUUID(),
      }),
    });
    assert.equal(forbiddenForward.status, 403, 'Nonmember cannot forward private media');
    await b.client.rpc('delete_own_message', { message: forwarded.messageId });
    for (const id of [...sentIds, location.data.id, contact.data.id])
      assert.ok(!(await a.client.rpc('delete_own_message', { message: id })).error);
    assert.deepEqual(
      (await b.client.from('message_locations').select('*').eq('message_id', location.data.id))
        .data,
      [],
      'Deletion removes exact point',
    );
    assert.deepEqual(
      (await b.client.from('message_contacts').select('*').eq('message_id', contact.data.id)).data,
      [],
      'Deletion removes contact link',
    );
    for (const path of paths)
      assert.ok(
        (await b.client.storage.from('chat-media').createSignedUrl(path, 60)).error,
        'Deleted message cannot authorize a new URL',
      );
    await c.admin.storage.from('chat-media').remove(paths);
  },
);
