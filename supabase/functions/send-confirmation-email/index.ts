import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret);
    
    const {
      user,
      email_data: { token, token_hash, redirect_to, email_action_type },
    } = wh.verify(payload, headers) as {
      user: {
        email: string;
      };
      email_data: {
        token: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
        site_url: string;
      };
    };

    const confirmationUrl = `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirme seu cadastro no Picotinho</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px;">Picotinho</h1>
            <p style="color: #64748b; margin: 5px 0 0 0;">Gerencie suas compras de supermercado</p>
          </div>
          
          <div style="background: #f8fafc; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
            <h2 style="color: #1e293b; margin: 0 0 20px 0; font-size: 24px;">Bem-vindo ao Picotinho! 🛒</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px;">
              Olá! Para concluir seu cadastro e começar a organizar suas compras de supermercado, confirme seu e-mail clicando no botão abaixo:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmationUrl}" 
                 style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                Confirmar E-mail
              </a>
            </div>
            
            <p style="margin: 20px 0 0 0; font-size: 14px; color: #64748b;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${confirmationUrl}" style="color: #2563eb; word-break: break-all;">${confirmationUrl}</a>
            </p>
          </div>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #64748b;">
              Se você não criou uma conta no Picotinho, pode ignorar este e-mail com segurança.
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #94a3b8;">
              © 2024 Picotinho - Gerencie suas compras de supermercado
            </p>
          </div>
        </body>
      </html>
    `;

    const { error } = await resend.emails.send({
      from: "Picotinho <no-reply@picotinho.app>",
      to: [user.email],
      subject: "Confirme seu cadastro no Picotinho",
      html: emailHtml,
    });

    if (error) {
      console.error("Erro ao enviar e-mail:", error);
      throw error;
    }

    console.log("E-mail de confirmação enviado com sucesso para:", user.email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro na função send-confirmation-email:", error);
    return new Response(
      JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});