import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_USER_ID = 'ae5b5501-7f8a-46da-9cba-b9955a84e697';
const BUCKETS = ['receipts', 'receitas-imagens'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Autenticação: só o próprio usuário-alvo pode chamar
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabaseAuth.auth.getUser();
    if (!userData?.user || userData.user.id !== TARGET_USER_ID) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const report: Record<string, number> = {};
    for (const bucket of BUCKETS) {
      let removed = 0;
      // Lista recursiva
      const allPaths: string[] = [];
      async function walk(prefix: string) {
        let offset = 0;
        while (true) {
          const { data, error } = await admin.storage.from(bucket).list(prefix, {
            limit: 1000, offset, sortBy: { column: 'name', order: 'asc' },
          });
          if (error) { console.error('list err', bucket, prefix, error); break; }
          if (!data || !data.length) break;
          for (const item of data) {
            const full = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) {
              await walk(full); // pasta
            } else {
              allPaths.push(full);
            }
          }
          if (data.length < 1000) break;
          offset += 1000;
        }
      }
      await walk(TARGET_USER_ID);

      // Remove em lotes de 100
      for (let i = 0; i < allPaths.length; i += 100) {
        const batch = allPaths.slice(i, i + 100);
        const { data, error } = await admin.storage.from(bucket).remove(batch);
        if (error) { console.error('remove err', bucket, error); continue; }
        removed += data?.length ?? 0;
      }
      report[bucket] = removed;
    }

    return new Response(JSON.stringify({ ok: true, removed: report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
