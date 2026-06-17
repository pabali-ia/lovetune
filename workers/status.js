export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId required' }), { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Buscar pedido no KV
    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response(JSON.stringify({ error: 'Order not found' }), { 
        status: 404,
        headers: corsHeaders 
      });
    }

    const order = JSON.parse(orderRaw);

    // Se já tiver áudio pronto retorna direto
    if (order.status === 'ready' || order.status === 'paid') {
      return new Response(JSON.stringify({ 
        status: order.status,
        audioUrl: order.previewUrl,
        letra: order.letra,
        orderId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar status no MiniMax via AIML
    const statusResponse = await fetch(`https://api.aimlapi.com/v2/generate/audio/minimax/music?task_id=${order.generationId}`, {
      headers: {
        'Authorization': `Bearer ${env.AIML_KEY}`,
      }
    });

    const statusData = await statusResponse.json();
    const audioUrl = statusData.audio_url || statusData.data?.audio_url;
    const taskStatus = statusData.status || statusData.task_status;

    if (audioUrl && (taskStatus === 'completed' || taskStatus === 'success')) {
      // Salvar áudio no R2
      const audioFile = await fetch(audioUrl);
      const audioBuffer = await audioFile.arrayBuffer();
      
      await env.AUDIO_BUCKET.put(`preview_${orderId}.mp3`, audioBuffer, {
        httpMetadata: { contentType: 'audio/mpeg' }
      });

      const previewUrl = `https://lovetune-audio.r2.dev/preview_${orderId}.mp3`;

      // Atualizar KV
      await env.ORDERS.put(orderId, JSON.stringify({
        ...order,
        status: 'ready',
        previewUrl,
        completedAt: Date.now(),
      }));

      return new Response(JSON.stringify({ 
        status: 'ready',
        audioUrl: previewUrl,
        letra: order.letra,
        orderId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ainda gerando
    return new Response(JSON.stringify({ 
      status: 'generating',
      taskStatus,
      orderId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}