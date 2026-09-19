import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { getRandomBytes } from 'expo-crypto';
import { requireNativeModule } from 'expo-modules-core';
import { bytesToHex } from './crypto';
import type { LocalDatabase } from './model';
import { openOwnedDatabase, type OwnedDatabaseBridge } from './database-owned';

const secretName = 'mnelo.device.database-key.v1';
const databaseName = 'history-v1.db';
export async function openDeviceDatabase(): Promise<LocalDatabase> {
  const vault = requireNativeModule<
    OwnedDatabaseBridge & {
      directory(): Promise<string>;
      hasDatabase(): boolean;
      publishShareKey(key: string): Promise<void>;
    }
  >('MneloVault');
  const directory = await vault.directory();
  let key = await SecureStore.getItemAsync(secretName);
  if (!key) {
    // A missing OS key must never silently replace an existing device history.
    if (Platform.OS === 'ios' ? vault.hasDatabase() : new File(directory, databaseName).exists)
      throw new Error('DEVICE_KEY_MISSING');
    key = bytesToHex(getRandomBytes(32));
    await SecureStore.setItemAsync(secretName, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('DEVICE_KEY_INVALID');
  // Preserve the existing key while permitting OS-authorized calls after screen lock.
  // After a device reboot, the first passcode unlock is still mandatory.
  await SecureStore.setItemAsync(secretName, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  if (Platform.OS === 'ios') {
    const database = await openOwnedDatabase(vault, key);
    try {
      await vault.publishShareKey(key);
    } catch (error) {
      await database.close();
      throw error;
    }
    return database;
  }
  const db = await SQLite.openDatabaseAsync(databaseName, { useNewConnection: true }, directory);
  try {
    const version = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!version?.cipher_version) throw new Error('SQLCIPHER_REQUIRED');
    // Only locally generated, strictly validated hex enters this SQLCipher pragma.
    await db.execAsync(
      `PRAGMA key = "x'${key}'"; PRAGMA cipher_memory_security = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 10000;`,
    );
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
  return {
    exec: (sql) => db.execAsync(sql),
    async run(sql, ...params) {
      await db.runAsync(sql, ...params);
    },
    all: <T>(sql: string, ...params: import('./model').SQLValue[]) =>
      db.getAllAsync<T>(sql, ...params),
    close: () => db.closeAsync(),
  };
}
