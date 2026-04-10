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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o Picotinho! 🛒</Preview>
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
        <Heading style={h1}>Você recebeu um convite! 🎉</Heading>
        <Text style={text}>
          Alguém especial te convidou para usar o Picotinho — o jeito mais fácil de organizar suas compras de supermercado.
        </Text>
        <Text style={text}>
          Clique no botão abaixo para aceitar o convite e criar sua conta:
        </Text>
        <div style={buttonContainer}>
          <Button style={button} href={confirmationUrl}>
            Aceitar convite
          </Button>
        </div>
        <div style={divider} />
        <Text style={footer}>
          Se você não esperava esse convite, pode ignorar este e-mail com segurança.
        </Text>
        <Text style={footerBrand}>
          © 2025 Picotinho — Suas compras organizadas com carinho 💚
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#f0fdf4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
const container = { backgroundColor: '#ffffff', padding: '40px 30px', maxWidth: '560px', margin: '40px auto', borderRadius: '16px', border: '1px solid #dcfce7' }
const logoContainer = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { display: 'inline-block' as const, borderRadius: '16px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#166534', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const buttonContainer = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#16a34a', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' as const }
const divider = { borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#9ca3af', margin: '0 0 8px', textAlign: 'center' as const }
const footerBrand = { fontSize: '12px', color: '#bbf7d0', margin: '0', textAlign: 'center' as const, backgroundColor: '#166534', padding: '12px', borderRadius: '8px' }
