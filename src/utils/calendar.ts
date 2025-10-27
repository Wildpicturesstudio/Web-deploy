import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';

export interface AvailabilityResponse {
  count: number;
  available: boolean;
  events: Array<{ id: string; summary?: string; start?: any; end?: any }>;
}

export async function gcalCheckAvailability(startISO: string, endISO: string): Promise<AvailabilityResponse> {
  const call = httpsCallable(functions as any, 'gcalCheckAvailability');
  const res: any = await call({ startISO, endISO });
  return res.data as AvailabilityResponse;
}

export interface UpsertBookingPayload {
  eventId?: string;
  startISO: string;
  endISO: string;
  location?: string;
  title: string;
  description?: string;
  attendees?: Array<{ email: string }>;
  external_reference?: string;
}

export async function gcalUpsertBooking(payload: UpsertBookingPayload): Promise<{ eventId: string; htmlLink?: string | null }>{
  const call = httpsCallable(functions as any, 'gcalUpsertBooking');
  const res: any = await call(payload);
  return res.data as { eventId: string; htmlLink?: string | null };
}

export function parseDurationToMinutes(text?: string): number {
  if (!text) return 120;
  const t = text.toLowerCase();
  const num = parseInt((t.match(/\d+/)?.[0] || '0'), 10);
  if (/min/.test(t)) return Math.max(30, num || 120);
  if (/hora|hour|h\b/.test(t)) return Math.max(30, (num || 2) * 60);
  return Math.max(30, num || 120);
}
