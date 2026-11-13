import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';

const storageKey = 'tempo.clinician.token';
const listeners = new Set<() => void>();
let token: string | null | undefined;

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredToken(next: string | null): boolean {
  try {
    if (next === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, next);
    return true;
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  if (token === undefined) token = readStoredToken();
  return token;
}

export function setToken(next: string | null) {
  token = next;
  writeStoredToken(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken);
}

export function signIn(queryClient: QueryClient, next: string) {
  queryClient.clear();
  setToken(next);
}

export function signOut(queryClient: QueryClient) {
  setToken(null);
  queryClient.clear();
}
