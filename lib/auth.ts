import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { User } from '@/lib/types';

const AUTH_COOKIE_NAME = 'alphaos_auth_token';

async function createAuthToken(password: string) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function setAuthCookie(password: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: await createAuthToken(password),
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function isAuthenticated() {
  const token = await getAuthToken();
  const validToken = process.env.ADMIN_PASSWORD;
  // If no ADMIN_PASSWORD is set, we assume local dev without auth is secure, but better to enforce it.
  // We'll require ADMIN_PASSWORD to be set, otherwise default to false.
  if (!validToken) return false;
  return token === await createAuthToken(validToken);
}

export async function isAuthenticatedRequest(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const validToken = process.env.ADMIN_PASSWORD;
  if (!validToken) return false;
  return token === await createAuthToken(validToken);
}

export async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  if (!(await isAuthenticatedRequest(req))) return null;
  return { id: 'owner', role: 'owner' };
}

export async function getUser(req: NextRequest): Promise<User | null> {
  return getUserFromRequest(req);
}

export async function requireOwner(req: NextRequest): Promise<User> {
  const user = await getUser(req);
  if (!user || user.role !== 'owner') {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!(await isAuthenticated())) return null;
  return { id: 'owner', role: 'owner' };
}
