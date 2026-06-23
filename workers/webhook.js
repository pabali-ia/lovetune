export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    console.log('Webhook recebido:', JSON.stringify(body));

    // ── EVENTO ───────────────────────────────────────────────
    // v2 transparente PIX → 'transaction.paid'
    // v1 billing cartão  → 'billing.paid'
    const evento = body.event || body.type || '';
    const eventosValidos = ['transaction.paid', 'billing.paid', 'payout.complete'];

    if (!eventosValidos.includes(evento)) {
      console.log('Evento ignorado:', evento);
      return new Response('Evento ignorado', { status: 200 });
    }

    // ── ORDER ID ─────────────────────────────────────────────
    // v2 transparente: body.data.metadata.orderId
    // v1 billing:      body.data.billing.metadata.orderId
    const orderId =
      body.data?.metadata?.orderId ||
      body.data?.billing?.metadata?.orderId ||
      body.metadata?.orderId;

    if (!orderId) {
      console.error('orderId não encontrado. Body:', JSON.stringify(body));
      return new Response('orderId missing', { status: 400 });
    }

    // ── KV ───────────────────────────────────────────────────
    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      console.error('Order não encontrada:', orderId);
      return new Response('Order not found', { status: 404 });
    }

    const order = JSON.parse(orderRaw);

    if (order.status === 'paid' || order.status === 'delivered') {
      console.log('Pedido já processado:', orderId);
      return new Response('Already processed', { status: 200 });
    }

    // ── ATUALIZAR STATUS ─────────────────────────────────────
    await env.ORDERS.put(orderId, JSON.stringify({
      ...order,
      status: 'paid',
      paidAt: Date.now(),
      webhookEvent: evento,
    }));

    console.log('Pedido marcado como pago:', orderId);

    // ── DISPARAR DELIVERY ────────────────────────────────────
    const origin = new URL(request.url).origin;
    const deliveryRes = await fetch(`${origin}/workers/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });

    if (!deliveryRes.ok) {
      const errText = await deliveryRes.text();
      console.error('Delivery falhou:', errText);
      // Não retorna erro — pagamento já foi confirmado, delivery pode ser retentado
    }

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}