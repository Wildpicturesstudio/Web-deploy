require('dotenv').config();

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const mpProdToken = process.env.MP_PROD_ACCESS_TOKEN;
const mpTestToken = process.env.MP_TEST_ACCESS_TOKEN;

function getAccessToken(mode) {
  return mode === 'prod' ? mpProdToken : mpTestToken;
}

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
  const accessToken = getAccessToken('prod');
  return { configured: Boolean(accessToken) };
});

// Mercado Pago - create preference
exports.mpCreatePreference = functions.https.onCall(async (data, context) => {
  try {
    const { preference, mode } = data || {};
    if (!preference || !Array.isArray(preference.items)) {
      throw new functions.https.HttpsError('invalid-argument', 'Preferência inválida.');
    }

    const accessToken = getAccessToken(mode || 'test');
    if (!accessToken) {
      throw new functions.https.HttpsError('failed-precondition', 'Mercado Pago no configurado. Defina las llaves en .env');
    }

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
      id: body.id,
      init_point: body.init_point,
      sandbox_init_point: body.sandbox_init_point,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err?.message || 'Erro desconhecido', err);
  }
});

// Mercado Pago webhook
exports.mpWebhook = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const nowIso = new Date().toISOString();

  try {
    const accessToken = getAccessToken('prod');
    const db = admin.firestore();
    const body = req.body || {};
    const query = req.query || {};

    const topic = String(body.type || body.topic || query.type || query.topic || '').toLowerCase();
    let paymentId = body?.data?.id || body?.id || query?.id || query?.['data.id'] || null;
    if (!paymentId && typeof body?.resource === 'string') {
      const m = body.resource.match(/\/payments\/(\d+)/);
      if (m) paymentId = m[1];
    }

    await db.collection('mp_webhooks').add({
      receivedAt: nowIso,
      topic: topic || null,
      paymentId: paymentId ? String(paymentId) : null,
      headers: req.headers || {},
      query,
      body,
    });

    if (topic !== 'payment') {
      return res.status(200).json({ received: true, skipped: 'non-payment-topic' });
    }
    if (!paymentId) {
      return res.status(200).json({ received: true, skipped: 'missing-payment-id' });
    }
    if (!accessToken) {
      return res.status(500).json({ error: 'Missing Mercado Pago configuration' });
    }

    const pid = String(paymentId);
    const payRef = db.collection('mp_payments').doc(pid);

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    let payment = null;
    try { payment = await r.clone().json(); } catch (_) { try { payment = await r.text(); } catch (e) { payment = null; } }
    if (!r.ok || !payment) {
      await payRef.set({ lastErrorAt: nowIso, lastError: 'failed-to-fetch-payment', httpStatus: r.status }, { merge: true });
      return res.status(200).json({ received: true, fetched: false });
    }

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
      if (prev && prev.processed && prev.status === incomingStatus) {
        tx.set(payRef, { lastSeenAt: nowIso }, { merge: true });
        return;
      }
      tx.set(payRef, data, { merge: true });

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
