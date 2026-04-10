/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefinir sua senha no Picotinho</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://picotinho.com.br/logo-picotinho.png" width="120" height="40" alt="Picotinho" style={logo} />
        <Heading style={h1}>Redefinir sua senha 🔑</Heading>
        <Text style={text}>
          Recebemos uma solicitação para redefinir a senha da sua conta no Picotinho. Clique no botão abaixo para criar uma nova senha:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Redefinir Senha
        </Button>
        <Text style={footerText}>
          Se o botão não funcionar, copie e cole este link no navegador:{' '}
          <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
        </Text>
        <Text style={footer}>
          Se você não solicitou a redefinição de senha, pode ignorar este e-mail. Sua senha não será alterada.
        </Text>
        <Text style={brand}>© 2025 Picotinho — Gerencie suas compras de supermercado</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#16a34a', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#1e293b', lineHeight: '1.6', margin: '0 0 24px' }
const link = { color: '#16a34a', textDecoration: 'underline' }
const button = {
  backgroundColor: '#16a34a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footerText = { fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '24px 0 0', wordBreak: 'break-all' as const }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '20px 0 0' }
const brand = { fontSize: '12px', color: '#cbd5e1', margin: '30px 0 0', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }
