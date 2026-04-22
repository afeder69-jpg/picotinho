// Shared auth helpers for Edge Functions (Wave 1 hotfix)
// - requireUser: validates JWT, returns userId + user-scoped supabase client
// - requireMaster: requireUser + checks role='master' via has_role RPC
// - adminClient: returns a service_role client for privileged operations
//
// These helpers DO NOT change behavior beyond authentication. Callers must
// derive userId from the returned object and ignore any userId in the body.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function adminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface AuthContext {
  userId: string;
  email: string | null;
  userClient: SupabaseClient;
  admin: SupabaseClient;
  token: string;
}

/**
 * Validates the Authorization: Bearer <jwt> header and returns the
 * authenticated user context. Throws AuthError(401) when missing/invalid.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new AuthError('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AuthError('Empty bearer token', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    userClient,
    admin: adminClient(),
    token,
  };
}

/**
 * Like requireUser, but also requires the caller to have role='master'
 * in public.user_roles (checked via has_role RPC).
 * Throws AuthError(403) when authenticated but not a master.
 */
export async function requireMaster(req: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  const { data: isMaster, error } = await ctx.admin.rpc('has_role', {
    _user_id: ctx.userId,
    _role: 'master',
  });
  if (error) {
    throw new AuthError('Authorization check failed', 500);
  }
  if (!isMaster) {
    throw new AuthError('Master role required', 403);
  }
  return ctx;
}

/** Helper to convert AuthError into a JSON Response with CORS. */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: 'Internal authentication error' }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
