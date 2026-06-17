export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      const data = await request.json();

      // 1. Gerar letra com Claude
      const letraResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Crie uma letra de música personalizada em português brasileiro com as seguintes informações:
              - Para: ${data.dest}
              - Ocasião: ${data.ocas}
              - Nomes: ${data.seuNome} e ${data.nomeRecebe}
              - Tempo juntos: ${data.tempo}
              - História: ${data.relacao}
              - Qualidades: ${data.qualidades}
              - Memória: ${data.memoria}
              - Mensagem final: ${data.mensagem}
              - Estilo musical: ${data.estilo}
              - Tom emocional: ${data.tom}
              
              Escreva apenas a letra com verso, pré-refrão e refrão. Sem explicações.`
          }]
        })
      });

      const letraData = await letraResponse.json();
      const letra = letraData.content[0].text;

      // 2. Gerar áudio com MiniMax via AIML
      const audioResponse = await fetch('https://api.aimlapi.com/v2/generate/audio/minimax/music', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.AIML_KEY}`,
        },
        body: JSON.stringify({
          model: 'music-01',
          lyrics: letra,
          voice_type: data.voz === 'Feminina' ? 'female' : 'male',
          style: data.estilo,
        })
      });

      const audioData = await audioResponse.json();
      const generationId = audioData.id || audioData.generation_id;

      // 3. Salvar pedido no KV
      const orderId = crypto.randomUUID();
      await env.ORDERS.put(orderId, JSON.stringify({
        ...data,
        letra,
        generationId,
        status: 'generating',
        createdAt: Date.now(),
      }));

      return new Response(JSON.stringify({ orderId, generationId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
