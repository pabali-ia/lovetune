export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    console.log('Webhook recebido:', JSON.stringify(body));

    // Verificar evento
    const evento = body.event || body.type;
    if (evento !== 'payout.complete' && evento !== 'billing.paid') {
      return new Response('Evento ignorado', { status: 200 });
    }

    // Pegar orderId dos metadados
    const orderId = body.data?.metadata?.orderId || body.metadata?.orderId;
    if (!orderId) {
      console.error('orderId não encontrado no webhook');
      return new Response('orderId missing', { status: 400 });
    }

    // Buscar pedido no KV
    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response('Order not found', { status: 404 });
    }

    const order = JSON.parse(orderRaw);

    // Se já foi pago, ignora
    if (order.status === 'paid' || order.status === 'delivered') {
      return new Response('Already processed', { status: 200 });
    }

    // Atualizar status para pago
    await env.ORDERS.put(orderId, JSON.stringify({
      ...order,
      status: 'paid',
      paidAt: Date.now(),
    }));

    // Disparar entrega
    await fetch(`https://lovetune.pages.dev/workers/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
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