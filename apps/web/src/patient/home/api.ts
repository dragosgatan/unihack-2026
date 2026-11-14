import { routes } from '@tempo/shared';
import { homeDataSchema, loadHomeData, saveHomeData, type HomeData } from './data.ts';

export class Unpaired extends Error {}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const checkPaired = (res: Response) => {
  if (res.status === 401 || res.status === 403) throw new Unpaired(`Device token rejected with ${res.status}`);
};

export async function pairDevice(code: string) {
  const res = await fetch(routes.redeemPairingCode.path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Pairing code rejected with ${res.status}`);
  return routes.redeemPairingCode.response.parse(await res.json());
}

export async function startHomeSession(token: string) {
  const res = await fetch(routes.startHomeSession.path, { method: 'POST', headers: bearer(token) });
  checkPaired(res);
  if (!res.ok) throw new Error(`Home session not started, status ${res.status}`);
  return routes.startHomeSession.response.parse(await res.json());
}

// shortcut: GET /api/device/home is not on the server yet, so any failure falls back to what this phone recorded itself.
export async function fetchHomeData(token: string): Promise<HomeData> {
  try {
    const res = await fetch('/api/device/home', { headers: bearer(token) });
    checkPaired(res);
    if (res.ok) {
      const data = homeDataSchema.parse(await res.json());
      saveHomeData(data);
      return data;
    }
  } catch (error) {
    if (error instanceof Unpaired) throw error;
    console.error(error);
  }
  return loadHomeData();
}
