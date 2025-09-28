import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Edge function temporariamente desabilitada - problemas de dependências
serve(async (req) => {
  return new Response(
    JSON.stringify({ 
      error: "Function temporarily disabled",
      message: "This edge function is currently disabled due to dependency issues"
    }), 
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }
  );
});