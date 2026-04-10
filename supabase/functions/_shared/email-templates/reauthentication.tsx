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
    <Preview>Seu código de verificação do Picotinho</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://picotinho.com.br/logo-picotinho.png" width="120" height="40" alt="Picotinho" style={logo} />
        <Heading style={h1}>Código de verificação 🔐</Heading>
        <Text style={text}>Use o código abaixo para confirmar sua identidade:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código expira em breve. Se você não solicitou, pode ignorar este e-mail com segurança.
        </Text>
        <Text style={brand}>© 2025 Picotinho — Gerencie suas compras de supermercado</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#16a34a', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#1e293b', lineHeight: '1.6', margin: '0 0 24px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#16a34a',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '13px', color: '#94a3b8', margin: '20px 0 0' }
const brand = { fontSize: '12px', color: '#cbd5e1', margin: '30px 0 0', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }
