import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SYNC_URL, DEFAULT_STORE_ROOM } from './data';

const SYNC_CONFIG_KEY = '@aj_sync_config_v1';

export async function getSyncConfig() {
  try {
    const raw = await AsyncStorage.getItem(SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        baseUrl: (parsed.baseUrl || DEFAULT_SYNC_URL).trim().replace(/\/+$/, ''),
        roomId: (parsed.roomId || DEFAULT_STORE_ROOM).trim() || DEFAULT_STORE_ROOM,
      };
    }
  } catch (e) {}
  return {
    baseUrl: DEFAULT_SYNC_URL.trim().replace(/\/+$/, ''),
    roomId: DEFAULT_STORE_ROOM,
  };
}

export async function saveSyncConfig(config) {
  const clean = {
    baseUrl: (config.baseUrl || '').trim().replace(/\/+$/, ''),
    roomId: (config.roomId || DEFAULT_STORE_ROOM).trim() || DEFAULT_STORE_ROOM,
  };
  await AsyncStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

export async function pullSharedState() {
  const { baseUrl, roomId } = await getSyncConfig();
  if (!baseUrl) return null;
  const endpoint = `${baseUrl}/stores/${encodeURIComponent(roomId)}.json`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error('Sync pull failed');
  return await res.json();
}

export async function pushSharedState(payload) {
  const { baseUrl, roomId } = await getSyncConfig();
  if (!baseUrl) return false;
  const endpoint = `${baseUrl}/stores/${encodeURIComponent(roomId)}.json`;
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      updatedAt: Date.now(),
    }),
  });
  if (!res.ok) throw new Error('Sync push failed');
  return true;
}
