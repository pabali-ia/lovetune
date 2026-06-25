export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    console.log('PerfectPay webhook:', JSON.stringify(body));

    // PerfectPay envia status "approved", "complete" ou "APPROVED"
    const status = body.status || body.sale_status || '';
    if(status !== 'approved' && status !== 'complete' && status !== 'APPROVED') {
      console.log('Evento ignorado, status:', status);
      return new Response('Ignorado', { status: 200 });
    }

    // orderId — captura de todos os campos possíveis
    const orderId =
      body.tracker_id ||
      body.utm_content ||
      body.metadata?.orderId ||
      body.metadata_orderId ||
      body.client_metadata?.orderId ||
      body.order_id ||
      '';

    if(!orderId) {
      console.error('orderId não encontrado. Body completo:', JSON.stringify(body));
      return new Response('orderId missing', { status: 400 });
    }

    console.log('orderId encontrado:', orderId);

    const orderRaw = await env.ORDERS.get(orderId);
    if(!orderRaw) {
      console.error('Order não encontrada no KV:', orderId);
      return new Response('Order not found', { status: 404 });
    }

    const order = JSON.parse(orderRaw);
    if(order.status === 'paid' || order.status === 'delivered') {
      console.log('Pedido já processado:', orderId);
      return new Response('Already processed', { status: 200 });
    }

    await env.ORDERS.put(orderId, JSON.stringify({
      ...order,
      status: 'paid',
      paidAt: Date.now(),
      webhookEvent: 'perfectpay.' + status,
    }));

    console.log('Pedido marcado como pago:', orderId);

    const origin = new URL(request.url).origin;
    const deliveryRes = await fetch(`${origin}/workers/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });

    if(!deliveryRes.ok) {
      console.error('Delivery falhou:', await deliveryRes.text());
    }

    return new Response('OK', { status: 200 });

  } catch(err) {
    console.error('PerfectPay webhook error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
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