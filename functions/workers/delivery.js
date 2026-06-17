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
    const audioUrl = 'https://lovetune-audio.r2.dev/' + orderId + '.mp3';

    const letraPreview = order.letra ? order.letra.substring(0, 300) + '...' : '';

    const emailHtml = [
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;background:#F7F2FC">',
      '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(255,77,141,0.1)">',
      '<h1 style="color:#FF4D8D;font-size:28px;margin-bottom:8px">🎵 Sua música está pronta!</h1>',
      '<p style="color:#6B7280;font-size:15px;margin-bottom:24px">',
      'Olá <strong style="color:#111827">' + order.seuNome + '</strong>, sua música personalizada para ',
      '<strong style="color:#111827">' + order.nomeRecebe + '</strong> ficou incrível!',
      '</p>',
      '<a href="' + audioUrl + '" style="display:inline-block;background:#10B981;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px">',
      '▶ Ouvir e baixar minha música',
      '</a>',
      '<p style="color:#9CA3AF;font-size:12px;margin-bottom:24px">Este link é exclusivo para você.</p>',
      '<div style="background:#F9F0FB;border-radius:16px;padding:20px;text-align:left;margin-bottom:24px">',
      '<p style="font-size:13px;color:#374151;line-height:1.7">' + letraPreview + '</p>',
      '</div>',
      '<p style="color:#9CA3AF;font-size:11px">LoveTune • contato@meulovetune.com.br<br/>CNPJ: 67.541.171/0001-07</p>',
      '</div>',
      '</div>'
    ].join('');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.RESEND_KEY,
      },
      body: JSON.stringify({
        from: 'LoveTune <contato@meulovetune.com.br>',
        to: order.email,
        subject: '🎵 Sua música está pronta, ' + order.seuNome + '!',
        html: emailHtml
      })
    });

    await env.ORDERS.put(orderId, JSON.stringify(Object.assign({}, order, {
      status: 'delivered',
      audioUrl: audioUrl,
      deliveredAt: Date.now(),
    })));

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('Delivery error:', err.message);
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