// Small key/value store: Keychain/Keystore (expo-secure-store) on phones,
// localStorage in the browser preview. Every call is failure-tolerant.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* ignore */
  }
}

export async function deleteItem(key: string): Promise<void> {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJSON(key: string, value: unknown) {
  await setItem(key, JSON.stringify(value));
}
