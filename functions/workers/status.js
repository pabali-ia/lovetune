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

    const orderRaw = await env.ORDERS.get(orderId);
    if (!orderRaw) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const order = JSON.parse(orderRaw);
    const r2Domain = env.R2_PUBLIC_DOMAIN || 'lovetune-audio.r2.dev';

    // ── JÁ ENTREGUE ───────────────────────────────────────────
    if (order.status === 'delivered') {
      return new Response(JSON.stringify({
        status: 'delivered',
        audioUrl: order.audioUrl || order.previewUrl || '',
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── PAGO MAS DELIVERY AINDA PROCESSANDO ──────────────────
    if (order.status === 'paid') {
      return new Response(JSON.stringify({
        status: 'paid',
        audioUrl: order.previewUrl || null,
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ÁUDIO PRONTO (ainda não pago) ─────────────────────────
    if (order.status === 'ready') {
      return new Response(JSON.stringify({
        status: 'ready',
        audioUrl: order.previewUrl,
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── AINDA GERANDO: consultar Suno ─────────────────────────
    const statusResponse = await fetch(
      'https://api.sunoapi.org/api/v1/generate/record-info?taskId=' + order.generationId,
      { headers: { 'Authorization': 'Bearer ' + env.SUNO_KEY } }
    );

    const statusData = await statusResponse.json();
    console.log('Suno status:', JSON.stringify(statusData));

    const sunoItems  = statusData.data?.response?.sunoData || [];
    const audioUrl   = sunoItems[0]?.audioUrl || sunoItems[0]?.audio_url;
    const taskStatus = statusData.data?.status;
    const isDone     = taskStatus === 'complete' || taskStatus === 'completed' || taskStatus === 'SUCCESS';

    if (audioUrl && isDone) {
      // ── SALVAR NO R2 com nome correto: orderId.mp3 ──────────
      try {
        const audioFile   = await fetch(audioUrl);
        const audioBuffer = await audioFile.arrayBuffer();
        await env.AUDIO_BUCKET.put(orderId + '.mp3', audioBuffer, {
          httpMetadata: { contentType: 'audio/mpeg' }
        });
        console.log('R2 salvo:', orderId + '.mp3');
      } catch (r2err) {
        console.error('R2 error:', r2err.message);
      }

      const r2Url = `https://${r2Domain}/${orderId}.mp3`;

      // Atualizar KV com ambas URLs
      await env.ORDERS.put(orderId, JSON.stringify({
        ...order,
        status: 'ready',
        previewUrl: audioUrl,  // URL Suno (temporária)
        audioUrl: r2Url,       // URL R2 (permanente)
        completedAt: Date.now(),
      }));

      return new Response(JSON.stringify({
        status: 'ready',
        audioUrl,
        letra: order.letra,
        nomeRecebe: order.nomeRecebe,
        orderId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── AINDA PROCESSANDO ─────────────────────────────────────
    return new Response(JSON.stringify({
      status: 'generating',
      taskStatus: taskStatus || 'pending',
      orderId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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