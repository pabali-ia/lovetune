export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      const body = await request.json();
      
      // Confirmar pagamento PIX aprovado
      const { orderId, status } = body;
      
      if (status !== 'approved') {
        return new Response('OK', { status: 200 });
      }

      // Buscar pedido no KV
      const orderRaw = await env.ORDERS.get(orderId);
      if (!orderRaw) {
        return new Response('Order not found', { status: 404 });
      }

      const order = JSON.parse(orderRaw);

      // Buscar áudio gerado no AIML
      const audioStatus = await fetch(`https://api.aimlapi.com/v2/generate/audio/minimax/music/${order.generationId}`, {
        headers: {
          'Authorization': `Bearer ${env.AIML_KEY}`,
        }
      });

      const audioData = await audioStatus.json();
      const audioUrl = audioData.audio_url || audioData.url;

      // Baixar áudio e salvar no R2
      const audioFile = await fetch(audioUrl);
      const audioBuffer = await audioFile.arrayBuffer();
      
      await env.AUDIO_BUCKET.put(`${orderId}.mp3`, audioBuffer, {
        httpMetadata: { contentType: 'audio/mpeg' }
      });

      // Atualizar status no KV
      await env.ORDERS.put(orderId,