export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const data = await request.json();

    // ── GERAR ORDERID CEDO ────────────────────────────────────
    // Salvar no KV antes de chamar APIs externas
    // para o frontend ter um orderId mesmo se algo falhar
    const orderId = crypto.randomUUID();

    await env.ORDERS.put(orderId, JSON.stringify({
      ...data,
      status: 'generating',
      createdAt: Date.now(),
    }));

    // ── 1. LETRA VIA GPT-4o-mini ──────────────────────────────
    const letraResponse = await fetch('https://api.aimlapi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.AIML_TEXT_KEY,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: buildLetraPrompt(data),
        }]
      })
    });

    if (!letraResponse.ok) {
      const errText = await letraResponse.text();
      throw new Error('AIML error: ' + errText);
    }

    const letraData = await letraResponse.json();
    const letra = letraData.choices?.[0]?.message?.content;

    if (!letra) throw new Error('Letra não gerada: ' + JSON.stringify(letraData));

    // Atualizar KV com letra
    await env.ORDERS.put(orderId, JSON.stringify({
      ...data,
      letra,
      status: 'generating',
      createdAt: Date.now(),
    }));

    // ── 2. ÁUDIO VIA SUNO ─────────────────────────────────────
    const estiloMap = {
      'Sertanejo':    'sertanejo romântico brasileiro, violão, voz emotiva',
      'Pop Romântico':'pop romântico brasileiro, melodia emotiva',
      'Samba e Pagode':'pagode brasileiro, cavaquinho, pandeiro',
      'Gospel':       'gospel brasileiro, coral, piano',
      'MPB':          'MPB brasileira, voz suave, violão',
      'R&B':          'R&B romântico, suave, intimista',
    };

    const estiloPrompt = estiloMap[data.estilo] || 'pop romântico brasileiro';
    const vozPrompt    = data.voz === 'Feminina' ? ', voz feminina' : ', voz masculina';

    // URL pública correta (sem /functions/)
    const origin      = new URL(request.url).origin;
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
        title: 'Para ' + (data.nomeRecebe || data.dest),
        customMode: true,
        instrumental: false,
        model: 'V4',
        negativeTags: 'heavy metal, rap, aggressive',
        callBackUrl,
      })
    });

    if (!sunoResponse.ok) {
      const errText = await sunoResponse.text();
      throw new Error('Suno error: ' + errText);
    }

    const sunoData     = await sunoResponse.json();
    const generationId = sunoData.data?.taskId || sunoData.taskId || sunoData.id;

    console.log('Suno response:', JSON.stringify(sunoData));

    if (!generationId) {
      throw new Error('Suno não retornou taskId: ' + JSON.stringify(sunoData));
    }

    // ── 3. ATUALIZAR KV FINAL ─────────────────────────────────
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
      letra,
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

// ── PROMPT BUILDER ────────────────────────────────────────────
function buildLetraPrompt(d) {
  // Aceita tanto os nomes do quiz novo quanto variações
  const para      = d.nomeRecebe || d.dest || '';
  const de        = d.seuNome    || d.nomeDe || '';
  const ocas      = d.ocas       || d.ocasiao || '';
  const tempo     = d.tempo      || '';
  const historia  = d.relacao    || d.historia || '';
  const uniao     = d.uniao      || '';
  const qualid    = d.qualidades || '';
  const mem       = d.memoria    || '';
  const msg       = d.mensagem   || '';
  const estilo    = d.estilo     || 'Pop Romântico';
  const tom       = d.tom        || 'Emotivo';
  const voz       = d.voz        || 'Masculina';

  return [
    'Crie uma letra de música personalizada em português brasileiro.',
    '',
    'Para: ' + para,
    'De: ' + de,
    'Ocasião: ' + ocas,
    tempo   ? 'Tempo juntos: ' + tempo    : '',
    historia? 'História: '    + historia  : '',
    uniao   ? 'O que representa: ' + uniao: '',
    qualid  ? 'Qualidades: '  + qualid    : '',
    mem     ? 'Memória