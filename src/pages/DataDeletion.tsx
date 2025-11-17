import { Card } from "@/components/ui/card";
import { Mail } from "lucide-react";

const DataDeletion = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Exclusão de Dados do Usuário
          </h1>
          <p className="text-muted-foreground">
            Instruções para solicitar a exclusão dos seus dados
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Como solicitar a exclusão dos seus dados
            </h2>
            <p className="text-foreground/80">
              O Picotinho respeita sua privacidade e o direito de excluir seus dados pessoais.
              Para solicitar a exclusão completa da sua conta e dados associados, siga os passos abaixo:
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Processo de Exclusão
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-foreground/80">
              <li>
                Envie um e-mail para nosso suporte solicitando a exclusão da sua conta
              </li>
              <li>
                Inclua no e-mail o endereço de e-mail associado à sua conta do Picotinho
              </li>
              <li>
                Nossa equipe processará sua solicitação em até 30 dias úteis
              </li>
              <li>
                Você receberá uma confirmação por e-mail quando a exclusão for concluída
              </li>
            </ol>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Dados que serão excluídos
            </h3>
            <ul className="list-disc list-inside space-y-1 text-foreground/80">
              <li>Informações de perfil (nome, e-mail, telefone)</li>
              <li>Histórico de notas fiscais e compras</li>
              <li>Estoque de produtos</li>
              <li>Receitas e cardápios criados</li>
              <li>Listas de compras</li>
              <li>Todas as preferências e configurações</li>
            </ul>
          </section>

          <section className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-lg font-semibold text-foreground">
              Contato para Exclusão de Dados
            </h3>
            <div className="flex items-center gap-2 text-foreground/80">
              <Mail className="w-5 h-5 text-primary" />
              <a 
                href="mailto:a.feder69@gmail.com?subject=Solicitação de Exclusão de Dados - Picotinho"
                className="text-primary hover:underline"
              >
                a.feder69@gmail.com
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              Assunto sugerido: "Solicitação de Exclusão de Dados - Picotinho"
            </p>
          </section>

          <section className="space-y-2 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              <strong>Nota:</strong> A exclusão dos dados é irreversível. 
              Certifique-se de fazer backup de qualquer informação importante antes de solicitar a exclusão.
            </p>
          </section>
        </Card>
      </div>
    </div>
  );
};

export default DataDeletion;
