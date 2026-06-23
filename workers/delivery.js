export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { orderId } = await request.json();

    // ── BUSCAR PEDIDO ─────────────────────────────────────────
    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response('Order not found', { status: 404 });
    }

    const order = JSON.parse(orderRaw);

    if (order.status === 'delivered') {
      return new Response('Already delivered', { status: 200 });
    }

    // ── VERIFICAR SE ÁUDIO EXISTE NO R2 ──────────────────────
    const audioKey = orderId + '.mp3';
    const audioObject = await env.AUDIO_BUCKET.head(audioKey);

    if (!audioObject) {
      // Áudio ainda não chegou — retentar em 30s via webhook ou polling
      console.error('Áudio não encontrado no R2:', audioKey);

      // Salvar status especial para o polling do frontend saber
      await env.ORDERS.put(orderId, JSON.stringify({
        ...order,
        status: 'paid', // mantém paid, não avança para delivered
        deliveryError: 'audio_not_ready',
        deliveryAttemptAt: Date.now(),
      }));

      return new Response(JSON.stringify({ error: 'audio_not_ready' }), {
        status: 202, // Accepted — vai retentar
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── URL DO ÁUDIO ──────────────────────────────────────────
    const r2Domain = env.R2_PUBLIC_DOMAIN || 'lovetune-audio.r2.dev';
    const audioUrl = `https://${r2Domain}/${audioKey}`;

    // ── EMAIL VIA RESEND ──────────────────────────────────────
    const letraPreview = order.letra
      ? order.letra.substring(0, 300).replace(/\n/g, '<br/>') + '...'
      : '';

    const emailHtml = [
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;background:#F7F2FC">',
      '<div style="background:white;border-radius:24px;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(255,77,141,0.1)">',
      '<h1 style="color:#FF4D8D;font-size:28px;margin-bottom:8px">🎵 Sua música está pronta!</h1>',
      '<p style="color:#6B7280;font-size:15px;margin-bottom:24px">',
      'Olá <strong style="color:#111827">' + (order.seuNome || order.nomeDe) + '</strong>,',
      ' sua música personalizada para ',
      '<strong style="color:#111827">' + order.nomeRecebe + '</strong> ficou incrível!',
      '</p>',
      '<a href="' + audioUrl + '" style="display:inline-block;background:#10B981;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px">',
      '▶ Ouvir e baixar minha música',
      '</a>',
      '<p style="color:#9CA3AF;font-size:12px;margin-bottom:24px">Este link é exclusivo para você.</p>',
      letraPreview ? [
        '<div style="background:#F9F0FB;border-radius:16px;padding:20px;text-align:left;margin-bottom:24px">',
        '<p style="font-size:13px;color:#6B7280;margin-bottom:8px;font-weight:600">Prévia da letra:</p>',
        '<p style="font-size:13px;color:#374151;line-height:1.7">' + letraPreview + '</p>',
        '</div>',
      ].join('') : '',
      '<p style="color:#9CA3AF;font-size:11px">',
      'LoveTune • contato@meulovetune.com.br<br/>CNPJ: 67.541.171/0001-07',
      '</p>',
      '</div>',
      '</div>',
    ].join('');

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.RESEND_KEY,
      },
      body: JSON.stringify({
        from: 'LoveTune <contato@meulovetune.com.br>',
        to: order.email,
        subject: '🎵 Sua música está pronta, ' + (order.seuNome || order.nomeDe) + '!',
        html: emailHtml,
      })
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      console.error('Resend error:', emailErr);
      // Não bloqueia — salva entregue mesmo assim, email pode ser retentado manualmente
    }

    // ── MARCAR COMO ENTREGUE ──────────────────────────────────
    await env.ORDERS.put(orderId, JSON.stringify({
      ...order,
      status: 'delivered',
      audioUrl,
      deliveredAt: Date.now(),
    }));

    console.log('Entrega concluída:', orderId, '→', order.email);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('Delivery error:', err.message);
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