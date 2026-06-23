export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const { orderId, method = 'pix' } = body;

    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const order = JSON.parse(orderRaw);

    // ── PIX TRANSPARENTE (chave v2) ───────────────────────────
    if (method === 'pix') {
      const response = await fetch('https://api.abacatepay.com/v2/transparents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.ABACATE_KEY_V2,
        },
        body: JSON.stringify({
          method: 'PIX',
          data: {
            amount: 3700,
            expiresIn: 1800,
            description: 'Música personalizada para ' + order.nomeRecebe + ' - ' + order.ocas,
            externalId: orderId,
            metadata: {
              orderId,
              email: order.email,
              whatsapp: order.whatsapp,
            }
          }
        })
      });

      const data = await response.json();
      console.log('AbacatePay PIX response:', JSON.stringify(data));

      if (!data.data?.brCode) {
        throw new Error('Erro ao criar PIX: ' + JSON.stringify(data));
      }

      await env.ORDERS.put(orderId, JSON.stringify({
        ...order,
        status: 'pending_payment',
        billingId: data.data.id,
        pixCode: data.data.brCode,
      }));

      return new Response(JSON.stringify({
        success: true,
        pixCode: data.data.brCode,
        pixQrCodeImage: data.data.brCodeBase64,
        billingId: data.data.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── CARTÃO — checkout externo (chave v1) ──────────────────
    if (method === 'card') {
      const origin = new URL(request.url).origin;

      const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.ABACATE_KEY,
        },
        body: JSON.stringify({
          methods: ['CREDIT_CARD'],
          products: [{
            externalId: env.ABACATE_PRODUCT_ID || 'prod_lovetune_37',
            quantity: 1,
          }],
          customer: {
            name: order.nomeDe || order.seuNome || 'Cliente LoveTune',
            email: order.email || '',
            cellphone: order.whatsapp || '',
          },
          returnUrl: `${origin}/preview?orderId=${orderId}&paid=true`,
          completionUrl: `${origin}/preview?orderId=${orderId}&paid=true`,
          metadata: { orderId },
        })
      });

      const data = await response.json();
      console.log('AbacatePay card response:', JSON.stringify(data));

      const paymentUrl = data.data?.url || data.url;
      if (!paymentUrl) {
        throw new Error('URL de checkout não retornada: ' + JSON.stringify(data));
      }

      await env.ORDERS.put(orderId, JSON.stringify({
        ...order,
        status: 'pending_payment',
        billingId: data.data?.id || data.id,
      }));

      return new Response(JSON.stringify({
        success: true,
        paymentUrl,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Método inválido: ' + method }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Payment error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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