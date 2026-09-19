import { AppState } from 'react-native';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { cleanupChatExports, exportChat } from '@/messenger/export-chat.native';
import { createChatExport } from '@/messenger/chat-export';
import type { DeviceMessenger } from '@/messenger/engine';
import type { ContactView } from '@/messenger/contact-view';

const mockClose = jest.fn();
const mockDelete = jest.fn();
const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('expo-file-system', () => ({
  FileMode: { WriteOnly: 'w' },
  Paths: { cache: { list: () => mockList() } },
  File: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    uri = 'file://cache/mnelo-chat-export-fixture.zip';
    exists = true;
    create() {
      mockCreate();
    }
    open() {
      return { writeBytes: mockWrite, close: mockClose };
    }
    delete() {
      mockDelete();
    }
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture' }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
const mockSaveFile = jest.fn();
jest.mock('@/messenger/share-native', () => ({
  saveChatExportFile: (uri: string) => mockSaveFile(uri),
}));
jest.mock('@/messenger/chat-export', () => ({ createChatExport: jest.fn() }));
const currentIdentity = jest.fn();
const deleteLocalChat = jest.fn();
const proof = { owner: 'owner', through: 1, digest: 'hash' };
const engine = { currentIdentity, deleteLocalChat } as unknown as DeviceMessenger;
const view = {} as ContactView;

beforeEach(() => {
  mockList.mockReturnValue([]);
  currentIdentity.mockReturnValue({ key: 'owner' });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue();
});

test('startup cleanup removes only abandoned export ZIPs and leaves active sharing untouched', async () => {
  const orphan = new File('mnelo-chat-export-abandoned.zip');
  const unrelated = new File('other-attachment.zip');
  mockList.mockReturnValue([orphan, unrelated]);
  cleanupChatExports();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  mockList.mockReturnValue([]);
  mockDelete.mockClear();
  jest
    .mocked(createChatExport)
    .mockResolvedValue({ messages: 0, attachments: 0, missingAttachments: 0, bytes: 0, proof });
  jest.mocked(Sharing.shareAsync).mockImplementation(async () => {
    mockList.mockReturnValue([orphan]);
    cleanupChatExports();
    expect(mockDelete).not.toHaveBeenCalled();
  });
  await exportChat(engine, view, 'chat');
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test('only a completed closed ZIP reaches the system save sheet and the temporary file is removed', async () => {
  jest.mocked(createChatExport).mockImplementation(async (_engine, _view, _id, options) => {
    await options.write(new Uint8Array([1, 2, 3]));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    return { messages: 1, attachments: 0, missingAttachments: 0, bytes: 3, proof };
  });
  jest.mocked(Sharing.shareAsync).mockImplementation(async () => {
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
  });
  await exportChat(engine, view, 'chat');
  expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String), {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
  });
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test('account changes cancel and remove a partial export without opening the share sheet', async () => {
  jest.mocked(createChatExport).mockImplementation(async (_engine, _view, _id, options) => {
    await options.write(new Uint8Array([1]));
    currentIdentity.mockReturnValue({ key: 'another-owner' });
    await options.write(new Uint8Array([2]));
    throw new Error('must not reach here');
  });
  await exportChat(engine, view, 'chat');
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('a stale screen never creates an export; a failed ZIP removes its partial file and permits retry', async () => {
  await exportChat(engine, view, 'chat', { isCurrent: () => false });
  expect(mockCreate).not.toHaveBeenCalled();
  jest.mocked(createChatExport).mockRejectedValue(new Error('EXPORT_TOO_LARGE'));
  await expect(exportChat(engine, view, 'chat')).rejects.toThrow('EXPORT_TOO_LARGE');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

for (const saved of [false, true])
  test(`export-and-delete requires Files to confirm save: ${saved}`, async () => {
    jest
      .mocked(createChatExport)
      .mockResolvedValue({ messages: 1, attachments: 0, missingAttachments: 0, bytes: 3, proof });
    mockSaveFile.mockResolvedValue(saved);
    await exportChat(engine, view, 'chat', { deleteAfterSaving: true });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    if (saved) expect(deleteLocalChat).toHaveBeenCalledWith('chat', proof);
    else expect(deleteLocalChat).not.toHaveBeenCalled();
  });
test('save failure, missing media and account/navigation changes all retain the original chat', async () => {
  jest
    .mocked(createChatExport)
    .mockResolvedValue({ messages: 1, attachments: 0, missingAttachments: 1, bytes: 3, proof });
  await expect(exportChat(engine, view, 'chat', { deleteAfterSaving: true })).rejects.toThrow(
    'EXPORT_MEDIA_MISSING',
  );
  expect(mockSaveFile).not.toHaveBeenCalled();
  jest
    .mocked(createChatExport)
    .mockResolvedValue({ messages: 1, attachments: 0, missingAttachments: 0, bytes: 3, proof });
  mockSaveFile.mockRejectedValueOnce(new Error('DISK_FULL'));
  await expect(exportChat(engine, view, 'chat', { deleteAfterSaving: true })).rejects.toThrow(
    'DISK_FULL',
  );
  mockSaveFile.mockImplementationOnce(async () => {
    currentIdentity.mockReturnValue({ key: 'changed' });
    return true;
  });
  await exportChat(engine, view, 'chat', { deleteAfterSaving: true });
  currentIdentity.mockReturnValue({ key: 'owner' });
  let active = true;
  mockSaveFile.mockImplementationOnce(async () => {
    active = false;
    return true;
  });
  await exportChat(engine, view, 'chat', { deleteAfterSaving: true, isCurrent: () => active });
  expect(deleteLocalChat).not.toHaveBeenCalled();
});
