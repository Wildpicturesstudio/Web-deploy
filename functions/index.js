const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const { google } = require('googleapis');

// Mercado Pago SDK v2
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Callable function to assign admin to a fixed email
exports.makeAdmin = functions.https.onCall(async (data, context) => {
  const email = "wildpicturesstudio@gmail.com";

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    return { message: `✅ Usuario ${email} ahora es admin` };
  } catch (error) {
    throw new functions.https.HttpsError("unknown", error.message, error);
  }
});

// Mercado Pago config check
exports.mpCheckConfig = functions.https.onCall(async (_data, _context) => {
  const accessToken = process.env.MP_ACCESS_TOKEN || (functions.config().mercadopago && functions.config().mercadopago.token);

  return { configured: Boolean(accessToken) };
});

// Mercado Pago - create preference via Firebase Functions (no Netlify)
exports.mpCreatePreference = functions.https.onCall(async (data, context) => {
  console.log('mpCreatePreference called, incoming data:', JSON.stringify(data));
  try {
    let { preference, bookingData } = data || {};

    // If preference is missing or invalid, try to construct it from bookingData
    if (!preference || !Array.isArray(preference.items) || preference.items.length === 0) {
      if (bookingData) {
        const cartItems = Array.isArray(bookingData.cartItems) ? bookingData.cartItems : [];
        const storeItems = Array.isArray(bookingData.storeItems) ? bookingData.storeItems : [];

        const servicesTotal = cartItems.reduce((sum, item) => {
          const price = typeof item.price === 'string'
            ? Number(item.price.replace(/[^0-9]/g, ''))
            : Number(item.price || 0);
          return sum + (price * (item.quantity || 1));
        }, 0);

        const storeTotal = storeItems.reduce((sum, item) => {
          return sum + ((Number(item.price) || 0) * (item.quantity || 1));
        }, 0);

        const subtotal = servicesTotal + storeTotal + (Number(bookingData.travelCost) || 0);
        const paymentDiscount = bookingData.paymentMethod === 'cash' ? Math.round(subtotal * 0.05) : 0;
        const totalAmount = subtotal - paymentDiscount;

        const servicesDeposit = Math.round(servicesTotal * 0.2);
        const storeDeposit = Math.round(storeTotal * 0.5);
        const depositAmount = servicesDeposit + storeDeposit;

        const items = [];
        if (depositAmount > 0) {
          items.push({ title: `Sinal - Wild Pictures Studio (${bookingData.eventType || ''})`, quantity: 1, unit_price: depositAmount, currency_id: 'BRL' });
        }
        if (depositAmount === 0 && totalAmount > 0) {
          items.push({ title: `Serviços Adicionais - Wild Pictures Studio`, quantity: 1, unit_price: totalAmount, currency_id: 'BRL' });
        }

        // Debug totals before building preference
        console.log('mpCreatePreference: totals', {
          servicesTotal,
          storeTotal,
          travelCost: Number(bookingData.travelCost) || 0,
          paymentMethod: bookingData.paymentMethod,
          paymentDiscount,
          subtotal,
          totalAmount,
          depositAmount,
        });

        if (items.length > 0) {
          preference = {
            items,
            payer: {
              name: bookingData.name || undefined,
              email: bookingData.email || undefined,
            },
            back_urls: {
              success: bookingData.successUrl || 'https://example.com/success',
              failure: bookingData.failureUrl || 'https://example.com/failure',
              pending: bookingData.pendingUrl || 'https://example.com/pending',
            },
            auto_return: 'approved',
            external_reference: bookingData.external_reference || `booking_${Date.now()}`,
          };
        }
      }
    }

    // Normalize items and enforce unit_price > 0
    if (!preference || !Array.isArray(preference.items)) {
      throw new functions.https.HttpsError('invalid-argument', 'Preferência inválida: itens ausentes.');
    }
    const normalized = (preference.items || []).map((it) => {
      const quantity = Math.max(1, parseInt(it.quantity, 10) || 1);
      const rawPrice = typeof it.unit_price === 'string' ? Number(it.unit_price.replace(/[^0-9.-]/g, '')) : Number(it.unit_price);
      const unit_price = Math.round(Number.isFinite(rawPrice) ? rawPrice : 0);
      const title = String(it.title || 'Item');
      const currency_id = it.currency_id || 'BRL';
      return { title, quantity, unit_price, currency_id };
    });
    preference.items = normalized.filter((it) => Number(it.unit_price) > 0);

    // Debug preference before request
    console.log('mpCreatePreference: debug', {
      bookingDataSummary: bookingData ? {
        name: bookingData.name || null,
        email: bookingData.email || null,
        eventType: bookingData.eventType || null,
        paymentMethod: bookingData.paymentMethod || null,
      } : null,
      items: preference.items,
    });

    if (preference.items.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Preferência inválida: não há itens com valor positivo.');
    }

    const accessToken = process.env.MP_ACCESS_TOKEN || (functions.config().mp && functions.config().mp.access_token);
    if (!accessToken) {
      throw new functions.https.HttpsError('failed-precondition', 'Mercado Pago não configurado. Defina MP_ACCESS_TOKEN nas variáveis do Firebase Functions.');
    }

    // Final alert-style debug before sending to MP
    console.log('alert', {
      bookingData,
      items: Array.isArray(preference.items) ? preference.items : [],
      preference,
    });
    console.log('PREFERENCE BEFORE MP:', JSON.stringify(preference, null, 2));

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    let body = null;
    try { body = await response.clone().json(); } catch (_) { try { body = await response.text(); } catch (e) { body = null; } }

    if (!response.ok) {
      const msg = (body && (body.message || body.error)) || 'Erro ao criar preferência';
      throw new functions.https.HttpsError('unknown', msg);
    }

    return {
      preferenceId: body.id,
      id: body.id,
      init_point: body.init_point,
      sandbox_init_point: body.sandbox_init_point,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err?.message || 'Erro desconhecido', err);
  }
});

// Google Calendar: check availability (allow up to 2 concurrent events)
exports.gcalCheckAvailability = functions.https.onCall(async (data, _context) => {
  console.log('gcalCheckAvailability called, data:', JSON.stringify(data));
  try {
    let { startISO, endISO, calendarId = 'primary' } = data || {};
    // Accept Date objects or nested start/end
    if ((!startISO || !endISO) && data?.start && data?.end) {
      try {
        startISO = new Date(data.start).toISOString();
        endISO = new Date(data.end).toISOString();
      } catch (e) {
        console.error('gcalCheckAvailability date parse error', e);
      }
    }
    if (!startISO || !endISO) throw new functions.https.HttpsError('invalid-argument', 'startISO e endISO são obrigatórios');

    let auth, client, calendar;
    try {
      auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/calendar'] });
      client = await auth.getClient();
      calendar = google.calendar({ version: 'v3', auth: client });
    } catch (e) {
      console.error('gcalCheckAvailability auth error', e && e.stack ? e.stack : e);
      throw new functions.https.HttpsError('internal', 'Erro ao autenticar com Google Calendar');
    }

    let resp;
    try {
      resp = await calendar.events.list({
        calendarId,
        timeMin: startISO,
        timeMax: endISO,
        singleEvents: true,
        orderBy: 'startTime',
      });
    } catch (e) {
      console.error('gcalCheckAvailability calendar.events.list error', e && e.stack ? e.stack : e);
      throw new functions.https.HttpsError('internal', 'Erro ao consultar eventos no Google Calendar');
    }

    const events = (resp && resp.data && resp.data.items) ? resp.data.items : [];
    const count = events.length;
    const available = count < 2;
    return { count, available, events: events.map(e => ({ id: e.id, summary: e.summary, start: e.start, end: e.end })) };
  } catch (err) {
    console.error('gcalCheckAvailability error', err && err.stack ? err.stack : err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err?.message || 'Erro gcalCheckAvailability');
  }
});

// Google Calendar: create or update booking event
exports.gcalUpsertBooking = functions.https.onCall(async (data, _context) => {
  console.log('gcalUpsertBooking called, data:', JSON.stringify(data));
  try {
    let { eventId, startISO, endISO, location, title, description, attendees, calendarId = 'primary', external_reference } = data || {};
    // Accept start/end fields as Date or nested values
    if ((!startISO || !endISO) && data?.start && data?.end) {
      try {
        startISO = new Date(data.start).toISOString();
        endISO = new Date(data.end).toISOString();
      } catch (e) {}
    }
    if (!startISO || !endISO || !title) throw new functions.https.HttpsError('invalid-argument', 'Campos obrigatórios ausentes');

    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/calendar'] });
    const client = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const eventBody = {
      summary: title,
      description: description || '',
      start: { dateTime: startISO, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endISO, timeZone: 'America/Sao_Paulo' },
      location: location || undefined,
      attendees: Array.isArray(attendees) ? attendees : undefined,
      extendedProperties: external_reference ? { private: { external_reference } } : undefined,
    };

    let result;
    if (eventId) {
      result = await calendar.events.update({ calendarId, eventId, requestBody: eventBody });
    } else {
      result = await calendar.events.insert({ calendarId, requestBody: eventBody });
    }

    const ev = result.data;
    const db = admin.firestore();
    await db.collection('calendar_bookings').doc(ev.id).set({
      calendarId,
      eventId: ev.id,
      start: ev.start,
      end: ev.end,
      location: ev.location || null,
      summary: ev.summary || null,
      external_reference: external_reference || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { eventId: ev.id, htmlLink: ev.htmlLink || null };
  } catch (err) {
    console.error('gcalUpsertBooking error', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err?.message || 'Erro gcalUpsertBooking');
  }
});

// HTTPS endpoint to create a basic test preference
exports.create_preference = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN || (functions.config().mp && functions.config().mp.access_token);
    if (!accessToken) return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN' });

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    // Accept body.items or use a default demo item
    const items = Array.isArray(req.body?.items) && req.body.items.length
      ? req.body.items
      : [{ title: 'Produto de Teste', quantity: 1, unit_price: 100, currency_id: 'BRL' }];

    const result = await preference.create({
      body: {
        items,
        auto_return: 'approved',
        back_urls: {
          success: 'https://example.com/success',
          failure: 'https://example.com/failure',
          pending: 'https://example.com/pending',
        },
        metadata: { source: 'firebase-functions' },
      },
    });

    return res.status(200).json({ preferenceId: result?.id });
  } catch (e) {
    console.error('create_preference error', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

// Mercado Pago webhook - receive notifications and persist minimal audit
exports.mpWebhook = functions.https.onRequest(async (req, res) => {
  // Basic CORS for MP callbacks
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const nowIso = new Date().toISOString();

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN || (functions.config().mp && functions.config().mp.access_token);
    const db = admin.firestore();
    const body = req.body || {};
    const query = req.query || {};

    // Extract topic/type and payment id robustly (supports classic and v2 webhooks)
    const topic = String(body.type || body.topic || query.type || query.topic || '').toLowerCase();
    let paymentId = body?.data?.id || body?.id || query?.id || query?.['data.id'] || null;
    if (!paymentId && typeof body?.resource === 'string') {
      const m = body.resource.match(/\/payments\/(\d+)/);
      if (m) paymentId = m[1];
    }

    // Save audit log
    await db.collection('mp_webhooks').add({
      receivedAt: nowIso,
      topic: topic || null,
      paymentId: paymentId ? String(paymentId) : null,
      headers: req.headers || {},
      query,
      body,
    });

    // Validate input
    if (topic !== 'payment') {
      return res.status(200).json({ received: true, skipped: 'non-payment-topic' });
    }
    if (!paymentId) {
      return res.status(200).json({ received: true, skipped: 'missing-payment-id' });
    }
    if (!accessToken) {
      console.warn('mpWebhook: missing MP access token');
      return res.status(500).json({ error: 'Missing Mercado Pago configuration' });
    }

    const pid = String(paymentId);

    // Idempotency: avoid reprocessing same payment if already stored with same status
    const payRef = db.collection('mp_payments').doc(pid);

    // Fetch payment from MP API to verify authenticity and current status
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    let payment = null;
    try { payment = await r.clone().json(); } catch (_) { try { payment = await r.text(); } catch (e) { payment = null; } }
    if (!r.ok || !payment) {
      await payRef.set({ lastErrorAt: nowIso, lastError: 'failed-to-fetch-payment', httpStatus: r.status }, { merge: true });
      return res.status(200).json({ received: true, fetched: false });
    }

    // Upsert with idempotency flags
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(payRef);
      const prev = snap.exists ? snap.data() : null;
      const incomingStatus = payment.status || payment?.body?.status || null;
      const data = {
        fetchedAt: nowIso,
        payment,
        status: incomingStatus,
        processed: true,
        processedAt: nowIso,
      };
      // If already processed with same status, do nothing special
      if (prev && prev.processed && prev.status === incomingStatus) {
        tx.set(payRef, { lastSeenAt: nowIso }, { merge: true });
        return;
      }
      tx.set(payRef, data, { merge: true });

      // OPTIONAL: Update related order/contract by external_reference when present
      const extRef = payment.external_reference || payment?.metadata?.external_reference || null;
      if (extRef) {
        const ordersCol = db.collection('orders');
        const q = await ordersCol.where('external_reference', '==', extRef).limit(1).get().catch(() => null);
        if (q && !q.empty) {
          const docRef = q.docs[0].ref;
          tx.set(docRef, { paymentStatus: incomingStatus, mpPaymentId: pid, updated_at: nowIso }, { merge: true });
        }
      }
    });

    return res.status(200).json({ received: true, paymentId: pid });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
