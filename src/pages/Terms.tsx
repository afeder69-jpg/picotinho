import { Card } from "@/components/ui/card";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Termos de Serviço
          </h1>
          <p className="text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              1. Aceitação dos Termos
            </h2>
            <p className="text-foreground/80">
              Ao acessar e usar o Picotinho, você concorda com estes Termos de Serviço.
              Se você não concorda com algum destes termos, não utilize nosso aplicativo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              2. Descrição do Serviço
            </h2>
            <p className="text-foreground/80">
              O Picotinho é um aplicativo que permite:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Digitalizar e armazenar notas fiscais de compras</li>
              <li>Gerenciar estoque doméstico de produtos</li>
              <li>Comparar preços entre estabelecimentos</li>
              <li>Criar e gerenciar receitas e cardápios</li>
              <li>Gerar listas de compras otimizadas</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              3. Cadastro e Conta
            </h2>
            <p className="text-foreground/80">
              Para usar o Picotinho, você deve:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Fornecer informações precisas e atualizadas</li>
              <li>Manter a segurança de suas credenciais de acesso</li>
              <li>Notificar-nos imediatamente sobre qualquer uso não autorizado</li>
              <li>Ser responsável por todas as atividades em sua conta</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              4. Uso Aceitável
            </h2>
            <p className="text-foreground/80">
              Você concorda em NÃO:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Usar o serviço para fins ilegais ou não autorizados</li>
              <li>Tentar acessar dados de outros usuários</li>
              <li>Sobrecarregar ou interferir com o funcionamento do serviço</li>
              <li>Fazer engenharia reversa ou copiar o aplicativo</li>
              <li>Compartilhar conteúdo ofensivo, difamatório ou inadequado</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              5. Propriedade Intelectual
            </h2>
            <p className="text-foreground/80">
              O Picotinho e todo seu conteúdo (design, código, marcas) são de propriedade exclusiva
              e estão protegidos por leis de propriedade intelectual. Você mantém os direitos sobre
              os dados que você insere no aplicativo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              6. Preços e Informações
            </h2>
            <p className="text-foreground/80">
              As informações de preços exibidas no aplicativo são baseadas nos dados das notas fiscais
              processadas. Não garantimos a precisão ou atualidade de preços de terceiros.
              Os preços podem variar sem aviso prévio.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              7. Disponibilidade do Serviço
            </h2>
            <p className="text-foreground/80">
              Embora nos esforcemos para manter o serviço disponível 24/7, não garantimos que o Picotinho
              estará sempre acessível ou livre de erros. Podemos suspender o serviço para manutenção ou
              atualizações sem aviso prévio.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              8. Limitação de Responsabilidade
            </h2>
            <p className="text-foreground/80">
              O Picotinho é fornecido "como está". Não nos responsabilizamos por:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 ml-4">
              <li>Perda de dados ou lucros</li>
              <li>Interrupções no serviço</li>
              <li>Decisões de compra baseadas nas informações do app</li>
              <li>Erros no processamento de notas fiscais</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              9. Modificações dos Termos
            </h2>
            <p className="text-foreground/80">
              Reservamos o direito de modificar estes termos a qualquer momento.
              Mudanças significativas serão notificadas através do aplicativo ou por e-mail.
              O uso continuado após as alterações constitui aceitação dos novos termos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              10. Rescisão
            </h2>
            <p className="text-foreground/80">
              Podemos suspender ou encerrar sua conta se você violar estes termos.
              Você pode encerrar sua conta a qualquer momento solicitando a exclusão de dados.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              11. Lei Aplicável
            </h2>
            <p className="text-foreground/80">
              Estes termos são regidos pelas leis brasileiras. Qualquer disputa será resolvida
              nos tribunais competentes do Brasil.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-border">
            <h2 className="text-xl font-semibold text-foreground">
              Contato
            </h2>
            <p className="text-foreground/80">
              Para dúvidas sobre estes termos, entre em contato:
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

export default Terms;
