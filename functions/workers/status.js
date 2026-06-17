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
    if (order.status === 'ready' || order.status === 'paid' || order.status === 'delivered') {
      return new Response(JSON.stringify({
        status: order.status,
        audioUrl: order.previewUrl,
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar status no Suno API
    const statusResponse = await fetch('https://api.sunoapi.org/api/v1/generate/record-info?taskId=' + order.generationId, {
      headers: {
        'Authorization': 'Bearer ' + env.SUNO_KEY,
      }
    });

    const statusData = await statusResponse.json();
    console.log('Suno status:', JSON.stringify(statusData));

    // Verificar se tem audio_url nos dados
    const sunoItems = statusData.data?.response?.sunoData || [];
    const audioUrl = sunoItems[0]?.audioUrl || sunoItems[0]?.audio_url;
    const taskStatus = statusData.data?.status;

    if (audioUrl && (taskStatus === 'complete' || taskStatus === 'completed' || taskStatus === 'SUCCESS')) {
      // Salvar áudio no R2
      try {
        const audioFile = await fetch(audioUrl);
        const audioBuffer = await audioFile.arrayBuffer();
        await env.AUDIO_BUCKET.put('preview_' + orderId + '.mp3', audioBuffer, {
          httpMetadata: { contentType: 'audio/mpeg' }
        });
      } catch(r2err) {
        console.error('R2 error:', r2err.message);
      }

      const previewUrl = audioUrl; // usa URL do Suno diretamente por enquanto

      // Atualizar KV
      await env.ORDERS.put(orderId, JSON.stringify(Object.assign({}, order, {
        status: 'ready',
        previewUrl,
        completedAt: Date.now(),
      })));

      return new Response(JSON.stringify({
        status: 'ready',
        audioUrl: previewUrl,
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ainda gerando
    return new Response(JSON.stringify({
      status: 'generating',
      taskStatus: taskStatus || 'pending',
      orderId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Status error:', err.message);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}