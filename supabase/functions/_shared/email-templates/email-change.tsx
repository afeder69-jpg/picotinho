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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a alteração do seu e-mail no Picotinho</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://picotinho.com.br/logo-picotinho.png" width="120" height="40" alt="Picotinho" style={logo} />
        <Heading style={h1}>Alteração de e-mail ✉️</Heading>
        <Text style={text}>
          Você solicitou a alteração do e-mail da sua conta no Picotinho de{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          para{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>
          Clique no botão abaixo para confirmar a alteração:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar Alteração
        </Button>
        <Text style={footer}>
          Se você não solicitou esta alteração, proteja sua conta imediatamente.
        </Text>
        <Text style={brand}>© 2025 Picotinho — Gerencie suas compras de supermercado</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const footer = { fontSize: '13px', color: '#94a3b8', margin: '20px 0 0' }
const brand = { fontSize: '12px', color: '#cbd5e1', margin: '30px 0 0', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }
