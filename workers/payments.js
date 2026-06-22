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

    // Criar cobrança PIX no AbacatePay
    const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.ABACATE_KEY,
      },
      body: JSON.stringify({
        frequency: 'ONE_TIME',
        methods: ['PIX'],
        products: [{
          externalId: orderId,
          name: 'Musica personalizada para ' + order.nomeRecebe,
          description: order.ocas + ' - ' + order.estilo,
          quantity: 1,
          price: 3700,
        }],
        metadata: {
          orderId: orderId,
          email: order.email,
          whatsapp: order.whatsapp,
        },
        customer: {
          name: order.seuNome,
          email: order.email,
          cellphone: order.whatsapp,
          taxId: order.cpf || '00000000000',
        },
        returnUrl: 'https://lovetune.pages.dev/preview?orderId=' + orderId,
        completionUrl: 'https://lovetune.pages.dev/obrigado?orderId=' + orderId,
      })
    });

    const data = await response.json();
    console.log('AbacatePay response:', JSON.stringify(data));

    if (!data.data) {
      throw new Error('Erro ao criar cobranca: ' + JSON.stringify(data));
    }

    const billingId = data.data.id;

    // Buscar o código PIX da cobrança criada
    const pixResponse = await fetch('https://api.abacatepay.com/v1/billing/' + billingId + '/pix', {
      headers: {
        'Authorization': 'Bearer ' + env.ABACATE_KEY,
      }
    });

    let pixCode = null;
    let pixQrCodeImage = null;

    if(pixResponse.ok){
      const pixData = await pixResponse.json();
      console.log('PIX data:', JSON.stringify(pixData));
      pixCode = pixData.data?.code || pixData.data?.qrCode || pixData.code || pixData.qrCode || null;
      pixQrCodeImage = pixData.data?.qrCodeImage || pixData.qrCodeImage || null;
    }

    await env.ORDERS.put(orderId, JSON.stringify(Object.assign({}, order, {
      status: 'pending_payment',
      paymentUrl: data.data.url,
      billingId: billingId,
      pixCode: pixCode,
    })));

    return new Response(JSON.stringify({
      success: true,
      pixCode: pixCode,
      pixQrCodeImage: pixQrCodeImage,
      paymentUrl: data.data.url,
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