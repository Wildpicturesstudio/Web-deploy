export function isNetworkFetchError(err: any) {
  const msg = String(err?.message || err || '');
  if (typeof msg === 'string' && msg.includes('Failed to fetch')) return true;
  // Some browsers/SDKs may surface CORS or other network layer errors as TypeError
  if (err && typeof err === 'object' && err.name === 'TypeError') return true;
  return false;
}

export async function withFirestoreRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseDelay = opts?.baseDelayMs ?? 300;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isNet = isNetworkFetchError(err);
      if (attempt >= retries || !isNet) {
        throw err;
      }
      // exponential-ish backoff with jitter
      const delay = baseDelay * attempt + Math.floor(Math.random() * 100 * attempt);
      // If navigator is present and offline, wait until online or timeout
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // wait until online or a timeout equal to delay
        await new Promise<void>((resolve) => {
          const onOnline = () => { window.removeEventListener('online', onOnline); resolve(); };
          window.addEventListener('online', onOnline);
          setTimeout(() => {
            window.removeEventListener('online', onOnline);
            resolve();
          }, Math.min(5000, delay));
        });
      } else {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
