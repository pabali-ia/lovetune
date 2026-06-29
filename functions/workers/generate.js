export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const data = await request.json();

    // 1. Gerar letra com Llama 3.3 70B via Groq
    const letraResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.GROQ_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          // FIX BUG 1: música é para nomeRecebe, escrita por seuNome
          content: 'Crie uma letra de música personalizada em português brasileiro.\n\n' +
            'IMPORTANTE: A música é uma homenagem de ' + data.seuNome + ' PARA ' + data.nomeRecebe + '.\n' +
            'A música deve falar SOBRE ' + data.nomeRecebe + ' e ser endereçada A ' + data.nomeRecebe + '.\n' +
            'O narrador da música é ' + data.seuNome + ' cantando para ' + data.nomeRecebe + '.\n\n' +
            'Para: ' + data.dest + '\n' +
            'Ocasião: ' + data.ocas + '\n' +
            'Quem escreve: ' + data.seuNome + '\n' +
            'Quem recebe (protagonista da música): ' + data.nomeRecebe + '\n' +
            'Tempo juntos: ' + data.tempo + '\n' +
            'História: ' + data.relacao + '\n' +
            'O que representa: ' + data.uniao + '\n' +
            'Qualidades de ' + data.nomeRecebe + ': ' + data.qualidades + '\n' +
            'Memória marcante: ' + data.memoria + '\n' +
            'Mensagem final de ' + data.seuNome + ' para ' + data.nomeRecebe + ': ' + data.mensagem + '\n' +
            'Estilo musical: ' + data.estilo + '\n' +
            'Tom emocional: ' + data.tom + '\n' +
            'Voz: ' + data.voz + '\n\n' +
            'Escreva apenas a letra com: verso 1, pré-refrão, refrão, verso 2, refrão final. ' +
            'Use os nomes reais. O nome ' + data.nomeRecebe + ' deve aparecer na letra. ' +
            'Sem explicações, sem títulos de seção.'
        }]
      })
    });

    const letraData = await letraResponse.json();
    console.log('Groq response status:', letraResponse.status);
    console.log('Groq response:', JSON.stringify(letraData).substring(0, 300));

    if (!letraData.choices || !letraData.choices[0]) {
      throw new Error('Groq nao retornou choices: ' + JSON.stringify(letraData));
    }

    const letra = letraData.choices[0].message.content;

    // 2. Gerar áudio com Suno API
    const estiloMap = {
      'Sertanejo': 'sertanejo romântico brasileiro, violão, voz emotiva',
      'Pop Romântico': 'pop romântico brasileiro, melodia emotiva',
      'Samba e Pagode': 'pagode brasileiro, cavaquinho, pandeiro',
      'Gospel': 'gospel brasileiro, coral, piano',
      'MPB': 'MPB brasileira, voz suave, violão',
      'R&B': 'R&B romântico, suave, intimista',
    };

    const estiloPrompt = estiloMap[data.estilo] || 'pop romântico brasileiro';
    const vozPrompt = data.voz === 'Feminina' ? ', voz feminina' : ', voz masculina';

    const titulo = ('Para ' + (data.nomeRecebe || data.dest || 'você')).substring(0, 70);

    const origin = new URL(request.url).origin;
    const callBackUrl = origin + '/workers/webhook';

    const sunoResponse = await fetch('https://api.sunoapi.org/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.SUNO_KEY,
      },
      body: JSON.stringify({
        prompt: letra,
        style: estiloPrompt + vozPrompt,
        title: titulo,
        customMode: true,
        instrumental: false,
        model: 'V4',
        negativeTags: 'heavy metal, rap, aggressive',
        callBackUrl,
      })
    });

    const sunoData = await sunoResponse.json();
    console.log('Suno response:', JSON.stringify(sunoData));

    const generationId = sunoData.data?.taskId || sunoData.taskId || sunoData.id;

    if (!generationId) {
      throw new Error('Suno nao retornou taskId: ' + JSON.stringify(sunoData));
    }

    const orderId = crypto.randomUUID();
    await env.ORDERS.put(orderId, JSON.stringify({
      ...data,
      letra,
      generationId,
      status: 'generating',
      provider: 'suno',
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
    console.error('Generate error:', err.message);
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