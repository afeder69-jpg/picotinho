/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação do Picotinho: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoContainer}>
          <Img
            src="https://picotinho.com.br/logo-picotinho.png"
            width="120"
            height="120"
            alt="Picotinho"
            style={logo}
          />
        </div>
        <Heading style={h1}>Código de verificação 🔑</Heading>
        <Text style={text}>
          Use o código abaixo para confirmar sua identidade no Picotinho:
        </Text>
        <div style={codeContainer}>
          <Text style={codeStyle}>{token}</Text>
        </div>
        <Text style={text}>
          Este código expira em poucos minutos. Não compartilhe com ninguém.
        </Text>
        <div style={divider} />
        <Text style={footer}>
          Se você não solicitou esse código, pode ignorar este e-mail com segurança.
        </Text>
        <Text style={footerBrand}>
          © 2025 Picotinho — Suas compras organizadas com carinho 💚
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#f0fdf4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { backgroundColor: '#ffffff', padding: '40px 30px', maxWidth: '560px', margin: '40px auto', borderRadius: '16px', border: '1px solid #dcfce7' }
const logoContainer = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { display: 'inline-block' as const, borderRadius: '16px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#166534', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px', textAlign: 'center' as const }
const codeContainer = { textAlign: 'center' as const, margin: '24px 0', backgroundColor: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '2px dashed #86efac' }
const codeStyle = { fontFamily: '"SF Mono", "Fira Code", "Courier New", monospace', fontSize: '32px', fontWeight: 'bold' as const, color: '#166534', letterSpacing: '8px', margin: '0' }
const divider = { borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#9ca3af', margin: '0 0 8px', textAlign: 'center' as const }
const footerBrand = { fontSize: '12px', color: '#bbf7d0', margin: '0', textAlign: 'center' as const, backgroundColor: '#166534', padding: '12px', borderRadius: '8px' }
