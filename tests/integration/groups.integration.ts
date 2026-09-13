import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { waitForPostgres } from './realtime';
const context = localContext();
test(
  'private groups: creation, messaging, roles, avatar, blocks and revocation',
  { timeout: 45000 },
  async (t) => {
    const a = await testUser(context, '0601'),
      b = await testUser(context, '0602'),
      c = await testUser(context, '0603'),
      d = await testUser(context, '0604'),
      outsider = await testUser(context, '0605');
    t.after(async () => {
      for (const user of [a, b, c, d, outsider]) await user.client.removeAllChannels();
    });
    for (const [u, name] of [
      [a, 'dev_group_a'],
      [b, 'dev_group_b'],
      [c, 'dev_group_c'],
      [d, 'dev_group_d'],
      [outsider, 'dev_group_outside'],
    ] as const) {
      assert.ok(
        !(await u.client.rpc('save_profile', { display_name: name, username: name })).error,
      );
      assert.ok(
        !(
          await u.client.rpc('update_privacy', {
            discoverability: 'everyone',
            phone_visibility: 'nobody',
            request_audience: 'everyone',
          })
        ).error,
      );
    }
    for (const u of [b, c, d]) {
      const req = await a.client.rpc('send_connection_request', {
        target: u.id,
        context: 'Development group test',
      });
      assert.ok(req.data);
      assert.ok(
        !(await u.client.rpc('respond_connection_request', { request: req.data, action: 'accept' }))
          .error,
      );
    }
    const list = await a.client.rpc('list_connections', { query: 'dev_group_' });
    assert.ok(!list.error);
    assert.equal(list.data?.length, 3);
    const invalid = await a.client.rpc('create_group', {
      name: 'Invalid',
      members: [b.id, outsider.id],
      client_id: crypto.randomUUID(),
    });
    assert.ok(invalid.error, 'An unknown user cannot be added');
    const key = crypto.randomUUID();
    const created = await a.client.rpc('create_group', {
      name: 'Development private group',
      members: [b.id, c.id],
      client_id: key,
    });
    assert.ok(!created.error && created.data);
    const group = created.data;
    assert.equal(
      (
        await a.client.rpc('create_group', {
          name: 'Development private group',
          members: [b.id, c.id],
          client_id: key,
        })
      ).data,
      group,
      'Retry does not create a duplicate group',
    );
    const info = await b.client.rpc('get_group', { conversation: group });
    assert.ok(!info.error);
    assert.equal(info.data?.length, 3);
    assert.equal(info.data?.find((m) => m.member_id === a.id)?.role, 'admin');
    assert.ok(
      (await outsider.client.rpc('get_group', { conversation: group })).error,
      'Nonmember cannot enumerate roster',
    );
    assert.ok(
      (await b.client.rpc('rename_group', { conversation: group, name: 'Unauthorized' })).error,
    );
    assert.ok(
      (await b.client.rpc('add_group_member', { conversation: group, target: d.id })).error,
    );
    assert.ok(
      (
        await b.client.rpc('manage_group_member', {
          conversation: group,
          target: b.id,
          action: 'promote',
        })
      ).error,
      'No self-promotion',
    );
    assert.ok(
      !(
        await a.client.rpc('rename_group', {
          conversation: group,
          name: 'Renamed development group',
        })
      ).error,
    );
    assert.ok(
      !(await a.client.rpc('add_group_member', { conversation: group, target: d.id })).error,
    );
    let removedResolve!: () => void;
    const removed = new Promise<void>((r) => {
      removedResolve = r;
    });
    const channel = b.client.channel('conversation:' + group, { config: { private: true } }).on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_members',
        filter: 'conversation_id=eq.' + group,
      },
      (payload) => {
        if (payload.new.user_id === b.id && payload.new.left_at) removedResolve();
      },
    );
    await waitForPostgres(channel);
    const sent = await c.client.rpc('send_text_message', {
      conversation: group,
      text_body: 'Real group message',
      client_id: crypto.randomUUID(),
    });
    assert.ok(sent.data && !sent.error);
    const page = await b.client.rpc('get_messages', { conversation: group });
    assert.ok(page.data?.some((m) => m.id === sent.data.id));
    assert.ok(
      (
        await outsider.client.rpc('send_text_message', {
          conversation: group,
          text_body: 'Denied',
          client_id: crypto.randomUUID(),
        })
      ).error,
    );
    const bytes = Uint8Array.from(
      jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 80).data,
    );
    const uploaded = await fetch(context.url + '/functions/v1/chat-upload', {
      method: 'POST',
      headers: {
        apikey: context.key,
        Authorization: 'Bearer ' + a.token,
        'content-type': 'image/jpeg',
        'x-conversation-id': group,
        'x-upload-id': crypto.randomUUID(),
        'x-file-name': 'group.jpg',
      },
      body: bytes.buffer,
    });
    assert.equal(uploaded.status, 200);
    const { attachmentId } = (await uploaded.json()) as { attachmentId: string };
    assert.ok(
      (await b.client.rpc('set_group_avatar', { conversation: group, attachment: attachmentId }))
        .error,
      'Only admin can publish an avatar',
    );
    assert.ok(
      !(await a.client.rpc('set_group_avatar', { conversation: group, attachment: attachmentId }))
        .error,
    );
    const image = await b.client
      .from('message_attachments')
      .select('object_path')
      .eq('id', attachmentId)
      .single();
    assert.ok(!image.error && image.data);
    const url = await b.client.storage
      .from('chat-media')
      .createSignedUrl(image.data.object_path, 60);
    assert.ok(url.data && !url.error);
    assert.equal((await fetch(url.data.signedUrl)).status, 200);
    assert.ok(
      (await outsider.client.storage.from('chat-media').createSignedUrl(image.data.object_path, 60))
        .error,
    );
    assert.ok(
      (
        await a.client.rpc('send_attachment_message', {
          attachment: attachmentId,
          caption: 'Cannot delete an avatar as a message',
          client_id: crypto.randomUUID(),
        })
      ).error,
    );
    assert.ok(
      !(
        await a.client.rpc('manage_group_member', {
          conversation: group,
          target: b.id,
          action: 'remove',
        })
      ).error,
    );
    await Promise.race([
      removed,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Removal event missing')), 7000),
      ),
    ]);
    await b.client.removeChannel(channel);
    assert.ok((await b.client.rpc('get_group', { conversation: group })).error);
    assert.ok((await b.client.rpc('get_messages', { conversation: group })).error);
    assert.ok(
      (await b.client.storage.from('chat-media').createSignedUrl(image.data.object_path, 60)).error,
      'Removed member loses new avatar access',
    );
    assert.ok(
      (await a.client.rpc('add_group_member', { conversation: group, target: b.id })).error,
      'Cannot force a removed member back',
    );
    assert.ok(!(await c.client.rpc('block_user', { target: d.id })).error);
    assert.ok(
      (
        await c.client.rpc('send_text_message', {
          conversation: group,
          text_body: 'Blocked pair',
          client_id: crypto.randomUUID(),
        })
      ).error,
    );
    assert.ok(
      !(await c.client.rpc('leave_group', { conversation: group })).error,
      'Can leave even when group access is suspended by a block',
    );
    assert.ok(
      !(
        await a.client.rpc('manage_group_member', {
          conversation: group,
          target: d.id,
          action: 'promote',
        })
      ).error,
    );
    assert.ok(
      !(
        await a.client.rpc('manage_group_member', {
          conversation: group,
          target: d.id,
          action: 'demote',
        })
      ).error,
    );
    assert.ok(!(await a.client.rpc('leave_group', { conversation: group })).error);
    const final = await d.client.rpc('get_group', { conversation: group });
    assert.ok(!final.error);
    assert.equal(final.data?.length, 1);
    assert.equal(
      final.data?.[0]?.role,
      'admin',
      'Last remaining member succeeds the departing admin',
    );
    assert.ok(
      (await a.client.rpc('rename_group', { conversation: group, name: 'Former admin' })).error,
    );
    assert.ok(!(await d.client.rpc('set_group_avatar', { conversation: group })).error);
    assert.ok(
      (await d.client.storage.from('chat-media').createSignedUrl(image.data.object_path, 60)).error,
      'Removed avatar cannot get a new URL',
    );
    await context.admin.storage.from('chat-media').remove([image.data.object_path]);
  },
);
