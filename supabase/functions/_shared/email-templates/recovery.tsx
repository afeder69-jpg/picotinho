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
    <Preview>Redefina sua senha no Picotinho 🔒</Preview>
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
        <Heading style={h1}>Redefinir senha 🔐</Heading>
        <Text style={text}>
          Recebemos uma solicitação para redefinir a senha da sua conta no Picotinho.
        </Text>
        <Text style={text}>
          Clique no botão abaixo para criar uma nova senha. O link é válido por tempo limitado.
        </Text>
        <div style={buttonContainer}>
          <Button style={button} href={confirmationUrl}>
            Criar nova senha
          </Button>
        </div>
        <Text style={smallText}>
          Se o botão não funcionar, copie e cole este link no seu navegador:
        </Text>
        <Text style={linkText}>{confirmationUrl}</Text>
        <div style={divider} />
        <Text style={footer}>
          Se você não solicitou essa alteração, sua senha continua segura. Basta ignorar este e-mail.
        </Text>
        <Text style={footerBrand}>
          © 2025 Picotinho — Suas compras organizadas com carinho 💚
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#f0fdf4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { backgroundColor: '#ffffff', padding: '40px 30px', maxWidth: '560px', margin: '40px auto', borderRadius: '16px', border: '1px solid #dcfce7' }
const logoContainer = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { display: 'inline-block' as const, borderRadius: '16px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#166534', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const buttonContainer = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#16a34a', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' as const }
const smallText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 4px' }
const linkText = { fontSize: '12px', color: '#16a34a', wordBreak: 'break-all' as const, margin: '0 0 24px' }
const divider = { borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#9ca3af', margin: '0 0 8px', textAlign: 'center' as const }
const footerBrand = { fontSize: '12px', color: '#bbf7d0', margin: '0', textAlign: 'center' as const, backgroundColor: '#166534', padding: '12px', borderRadius: '8px' }
