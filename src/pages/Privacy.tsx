import { Card } from "@/components/ui/card";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Política de Privacidade
          </h1>
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              1. Informações que Coletamos
            </h2>
            <p className="text-foreground/80">
              O Picotinho coleta e armazena as seguintes informações:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Informações de cadastro (nome, e-mail, telefone)</li>
              <li>Dados de localização (para busca de supermercados próximos)</li>
              <li>Notas fiscais e histórico de compras</li>
              <li>Preferências e configurações do aplicativo</li>
              <li>Receitas, cardápios e listas de compras criadas</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              2. Como Usamos Seus Dados
            </h2>
            <p className="text-foreground/80">
              Utilizamos suas informações para:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Fornecer e melhorar nossos serviços</li>
              <li>Processar e armazenar suas notas fiscais</li>
              <li>Comparar preços e sugerir economias</li>
              <li>Gerar listas de compras otimizadas</li>
              <li>Enviar notificações relevantes sobre o serviço</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              3. Compartilhamento de Dados
            </h2>
            <p className="text-foreground/80">
              Não vendemos ou compartilhamos seus dados pessoais com terceiros para fins de marketing.
              Dados podem ser compartilhados apenas quando:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Necessário para fornecer o serviço (ex: processamento de notas fiscais)</li>
              <li>Exigido por lei ou ordem judicial</li>
              <li>Com seu consentimento explícito</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              4. Segurança dos Dados
            </h2>
            <p className="text-foreground/80">
              Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados contra
              acesso não autorizado, alteração, divulgação ou destruição. Utilizamos criptografia e 
              armazenamento seguro em servidores confiáveis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              5. Seus Direitos
            </h2>
            <p className="text-foreground/80">
              Você tem direito a:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir informações incorretas</li>
              <li>Solicitar a exclusão dos seus dados</li>
              <li>Revogar consentimentos dados anteriormente</li>
              <li>Exportar seus dados em formato legível</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              6. Cookies e Tecnologias Similares
            </h2>
            <p className="text-foreground/80">
              Utilizamos cookies e armazenamento local para melhorar sua experiência, 
              manter sua sessão ativa e lembrar suas preferências.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              7. Retenção de Dados
            </h2>
            <p className="text-foreground/80">
              Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para 
              fornecer nossos serviços. Você pode solicitar a exclusão de seus dados a qualquer momento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              8. Alterações nesta Política
            </h2>
            <p className="text-foreground/80">
              Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas
              através do aplicativo ou por e-mail.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-border">
            <h2 className="text-xl font-semibold text-foreground">
              Contato
            </h2>
            <p className="text-foreground/80">
              Para dúvidas sobre esta política ou sobre seus dados, entre em contato:
            </p>
            <p className="text-foreground/80">
              E-mail: <a href="mailto:a.feder69@gmail.com" className="text-primary hover:underline">a.feder69@gmail.com</a>
            </p>
          </section>
        </Card>
      </div>
    </div>
  );
};

export default Privacy;
