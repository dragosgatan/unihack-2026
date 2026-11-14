import { routes, type HomeData, type SubmittedResult } from '@tempo/shared';
import { loadOutbox } from '../session/store.ts';
import { loadHomeData, recordFinished, saveHomeData } from './data.ts';

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

const finishedAt = (results: SubmittedResult[]) =>
  new Date(Math.max(...results.map((result) => Date.parse(result.status === 'completed' ? result.completedAt : result.skippedAt))));

export async function fetchHomeData(token: string): Promise<HomeData> {
  try {
    const unsent = (await loadOutbox()).filter((entry) => entry.token === token && entry.body.results.length > 0);
    const res = await fetch(routes.getDeviceHome.path, { headers: bearer(token) });
    checkPaired(res);
    if (res.ok) {
      const data = unsent.reduce(
        (merged, { body }) => recordFinished(merged, body.results, finishedAt(body.results)),
        routes.getDeviceHome.response.parse(await res.json()),
      );
      saveHomeData(data);
      return data;
    }
  } catch (error) {
    if (error instanceof Unpaired) throw error;
    console.error(error);
  }
  return loadHomeData();
}
