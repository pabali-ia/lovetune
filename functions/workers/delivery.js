export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      const { orderId } = await request.json();

      // Buscar pedido no KV
      const orderRaw = await env.ORDERS.get(orderId);
      if (!orderRaw) {
        return new Response('Order not found', { status: 404 });
      }

      const order = JSON.parse(orderRaw);

      // Enviar e-mail via Resend
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_KEY}`,
        },
        body: JSON.stringify({
          from: 'LoveTune <contato@meulovetune.com.br>',
          to: order.email,
          subject: `🎵 Sua música está pronta, ${order.seuNome}!`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <h1 style="color:#FF4D8D">Sua música está pronta! 🎵</h1>
              <p>Olá ${order.seuNome}, sua música personalizada para <strong>${order.nomeRecebe}</strong> ficou incrível!</p>
              <a href="${order.audioUrl}" 
                 style="background:#10B981;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;margin:20px 0">
                ▶ Ouvir e baixar minha música
              </a>
              <p style="color:#6B7280;font-size:13px">Este link expira em 7 dias.</p>
            </div>