export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { orderId } = await request.json();

    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response('Order not found', { status: 404 });
    }

    const order = JSON.parse(orderRaw);

    // Criar cobrança PIX transparente no AbacatePay v2
    const response = await fetch('https://api.abacatepay.com/v2/transparents/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.ABACATE_KEY,
      },
      body: JSON.stringify({
        method: 'PIX',
        data: {
          amount: 3700,
          expiresIn: 1800,
          description: 'Musica personalizada para ' + order.nomeRecebe + ' - ' + order.ocas,
          externalId: orderId,
          metadata: {
            orderId: orderId,
            email: order.email,
            whatsapp: order.whatsapp,
          }
        }
      })
    });

    const data = await response.json();
    console.log('AbacatePay transparent response:', JSON.stringify(data));

    if (!data.data || !data.data.brCode) {
      throw new Error('Erro ao criar PIX: ' + JSON.stringify(data));
    }

    const pixCode = data.data.brCode;
    const pixQrCodeImage = data.data.brCodeBase64;
    const billingId = data.data.id;

    await env.ORDERS.put(orderId, JSON.stringify(Object.assign({}, order, {
      status: 'pending_payment',
      billingId: billingId,
      pixCode: pixCode,
    })));

    return new Response(JSON.stringify({
      success: true,
      pixCode: pixCode,
      pixQrCodeImage: pixQrCodeImage,
      billingId: billingId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Payment error:', err.message);
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