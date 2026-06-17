export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const data = await request.json();

    // 1. Gerar letra com gpt-4o-mini via AIML
    const letraResponse = await fetch('https://api.aimlapi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AIML_TEXT_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Crie uma letra de música personalizada em português brasileiro.
          
Para: ${data.dest}
Ocasião: ${data.ocas}
Nomes: ${data.seuNome} e ${data.nomeRecebe}
Tempo juntos: ${data.tempo}
História: ${data.relacao}
O que representa: ${data.uniao}
Qualidades: ${data.qualidades}
Memória marcante: ${data.memoria}
Mensagem final: ${data.mensagem}
Estilo musical: ${data.estilo}
Tom emocional: ${data.tom}
Voz: ${data.voz}

Escreva apenas a letra com: verso 1, pré-refrão, refrão, verso 2, refrão final.
Use os nomes reais. Sem explicações, sem títulos de seção.`
        }]
      })
    });

    const letraData = await letraResponse.json();
    const letra = letraData.choices[0].message.content;

    // 2. Gerar áudio com MiniMax via AIML
    const audioResponse = await fetch('https://api.aimlapi.com/v2/generate/audio/minimax/music', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AIML_KEY}`,
      },
      body: JSON.stringify({
        model: 'music-01-lyrics',
        lyrics: letra,
        refer_instrumental: data.estilo === 'Sertanejo' ? 'sertanejo' : 
                           data.estilo === 'Gospel' ? 'gospel' :
                           data.estilo === 'Samba e Pagode' ? 'samba' : 'pop',
      })
    });

    const audioData = await audioResponse.json();
    const generationId = audioData.task_id || audioData.id;

    // 3. Salvar pedido no KV
    const orderId = crypto.randomUUID();
    await env.ORDERS.put(orderId, JSON.stringify({
      ...data,
      letra,
      generationId,
      status: 'generating',
      createdAt: Date.now(),
    }));

    return new Response(JSON.stringify({ 
      success: true,
      orderId, 
      generationId,
      letra 
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}