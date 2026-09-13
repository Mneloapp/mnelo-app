import { z } from 'zod';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import { edgeRequest } from './edge-request';
import { mapMessage } from './chat-repository';
import { RepositoryError, type MneloRepository } from '../repository';
export function mediaRepository(): Pick<
  MneloRepository,
  | 'forwardMessage'
  | 'uploadAttachment'
  | 'sendAttachment'
  | 'attachment'
  | 'sendLocation'
  | 'sendContact'
> {
  const client = supabaseClient();
  return {
    async forwardMessage(messageId, conversationId, clientId) {
      const body = new TextEncoder().encode(
        JSON.stringify({ messageId, conversationId, clientId }),
      ).buffer;
      const result = await edgeRequest('chat-forward', body, {
        'Content-Type': 'application/json',
      });
      const parsed = z.object({ messageId: z.string().uuid() }).safeParse(result);
      if (!parsed.success) throw new RepositoryError('UNAVAILABLE');
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('id', parsed.data.messageId)
        .single();
      if (error) throw repositoryError(error);
      return mapMessage(data);
    },
    async uploadAttachment(input) {
      if (input.bytes.byteLength < 1 || input.bytes.byteLength > 20 * 1024 * 1024)
        throw new RepositoryError('INVALID');
      const result = await edgeRequest('chat-upload', input.bytes, {
        'Content-Type': input.mime,
        'x-conversation-id': input.conversationId,
        'x-upload-id': input.clientId,
        'x-file-name': encodeURIComponent(input.name),
      });
      const parsed = z.object({ attachmentId: z.string().uuid() }).safeParse(result);
      if (!parsed.success) throw new RepositoryError('UNAVAILABLE');
      return parsed.data.attachmentId;
    },
    async sendAttachment(attachmentId, caption, clientId) {
      const { data, error } = await client.rpc('send_attachment_message', {
        attachment: attachmentId,
        caption,
        client_id: clientId,
      });
      if (error) throw repositoryError(error);
      return mapMessage(data);
    },
    async attachment(id) {
      const { data, error } = await client
        .from('message_attachments')
        .select('object_path,file_name,mime_type,byte_size,duration_seconds,status')
        .eq('id', id)
        .eq('status', 'ready')
        .single();
      if (error) throw repositoryError(error);
      const signed = await client.storage.from('chat-media').createSignedUrl(data.object_path, 60);
      if (signed.error) throw repositoryError(signed.error);
      return {
        id,
        url: signed.data.signedUrl,
        name: data.file_name,
        mime: data.mime_type,
        size: data.byte_size,
        duration: data.duration_seconds,
      };
    },
    async sendLocation(input) {
      const { data, error } = await client.rpc('send_location_message', {
        conversation: input.conversationId,
        client_id: input.clientId,
        latitude: input.latitude,
        longitude: input.longitude,
        label: input.label,
      });
      if (error) throw repositoryError(error);
      return mapMessage(data);
    },
    async sendContact(conversationId, profileId, clientId) {
      const { data, error } = await client.rpc('send_contact_message', {
        conversation: conversationId,
        contact: profileId,
        client_id: clientId,
      });
      if (error) throw repositoryError(error);
      return mapMessage(data);
    },
  };
}
