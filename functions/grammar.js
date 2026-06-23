// functions/workers/grammar.js
// Corrige gramática usando AIML API (GPT-4o-mini)

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const { texto } = await request.json();
    if (!texto || texto.trim().length < 3) {
      return new Response(JSON.stringify({ corrigido: texto }), { headers: corsHeaders });
    }

    const res = await fetch('https://api.aimlapi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AIML_TEXT_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Corrija apenas os erros gramaticais e ortográficos do texto abaixo em português brasileiro. Mantenha exatamente o mesmo estilo, tom, vocabulário e conteúdo da pessoa. Não reescreva, não melhore, não adicione nada. Retorne SOMENTE o texto corrigido, sem explicações, sem aspas, sem introdução.\n\nTexto: ${texto}`
        }]
      })
    });

    const data = await res.json();
    const corrigido = data.choices?.[0]?.message?.content?.trim() || texto;

    return new Response(JSON.stringify({ corrigido }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
