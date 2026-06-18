export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase().trim();

    if (!q) {
      return new Response(JSON.stringify({ orders: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Listar todas as keys do KV
    const list = await env.ORDERS.list();
    const orders = [];

    for (const key of list.keys) {
      try {
        const raw = await env.ORDERS.get(key.name);
        if (!raw) continue;
        const order = JSON.parse(raw);

        // Busca por email ou whatsapp
        const emailMatch = order.email?.toLowerCase().includes(q);
        const waMatch = order.whatsapp?.replace(/\D/g, '').includes(q.replace(/\D/g, ''));

        if (emailMatch || waMatch) {
          orders.push({
            id: key.name,
            nomeRecebe: order.nomeRecebe,
            status: order.status,
            createdAt: order.createdAt,
            ocas: order.ocas,
            estilo: order.estilo,
          });
        }
      } catch(e) {
        continue;
      }
    }

    // Ordenar por mais recente
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return new Response(JSON.stringify({ orders }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
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