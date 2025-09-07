import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { ConfirmacaoNotaDuvidosa } from '@/components/ConfirmacaoNotaDuvidosa';

// Função para normalizar nomes de arquivos
const normalizeFileName = (fileName: string): string => {
  // Extrair nome e extensão
  const lastDotIndex = fileName.lastIndexOf('.');
  const name = fileName.substring(0, lastDotIndex);
  const extension = fileName.substring(lastDotIndex);
  
  // Normalizar o nome
  let normalizedName = name
    // Remover acentos e caracteres especiais
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Substituir espaços e caracteres especiais por underscores
    .replace(/[^a-zA-Z0-9]/g, '_')
    // Remover underscores múltiplos
    .replace(/_+/g, '_')
    // Remover underscores no início e fim
    .replace(/^_|_$/g, '')
    // Converter para minúsculas
    .toLowerCase();
  
  // Limitar o tamanho
  if (normalizedName.length > 50) {
    normalizedName = normalizedName.substring(0, 50);
  }
  
  return normalizedName + extension.toLowerCase();
};

interface UploadNoteButtonProps {
  onUploadSuccess: () => void;
}

export const UploadNoteButton: React.FC<UploadNoteButtonProps> = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [notaDuvidosa, setNotaDuvidosa] = useState<{
    message: string;
    notaImagemId: string;
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!currentUser) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para enviar notas fiscais.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const validFiles = Array.from(files).filter(file => {
        const isValidType = file.type === 'application/pdf' || 
                           file.type.startsWith('image/') ||
                           file.type === 'image/jpeg' ||
                           file.type === 'image/png' ||
                           file.type === 'image/webp';
        
        const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB

        if (!isValidType) {
          toast({
            title: "Arquivo inválido",
            description: `${file.name}: Apenas imagens (JPEG, PNG, WebP) e PDFs são aceitos.`,
            variant: "destructive",
          });
          return false;
        }

        if (!isValidSize) {
          toast({
            title: "Arquivo muito grande",
            description: `${file.name}: Tamanho máximo permitido é 50MB.`,
            variant: "destructive",
          });
          return false;
        }

        return true;
      });

      if (validFiles.length === 0) {
        setUploading(false);
        return;
      }

      let successfulUploads = 0;

      for (const file of validFiles) {
        try {
          console.log('🚨 DEBUG: Processando arquivo:', file.name);
          
          const isPdf = file.type === 'application/pdf';
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const normalizedName = normalizeFileName(file.name);
          const fileName = `${timestamp}-${randomStr}-${normalizedName}`;
          const filePath = `${currentUser.id}/${fileName}`;

          // Upload para storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Erro no upload:', uploadError);
            toast({
              title: "Erro no upload",
              description: `Erro ao enviar ${file.name}: ${uploadError.message}`,
              variant: "destructive",
            });
            continue;
          }

          // Obter URL pública
          const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);

          if (!urlData.publicUrl) {
            toast({
              title: "Erro",
              description: `Erro ao obter URL pública para ${file.name}`,
              variant: "destructive",
            });
            continue;
          }

          // Inserir registro na tabela notas_imagens
          const { data: notaData, error: notaError } = await supabase
            .from('notas_imagens')
            .insert({
              usuario_id: currentUser.id,
              imagem_url: urlData.publicUrl,
              imagem_path: filePath,
              nome_original: file.name,
              processada: false
            })
            .select()
            .single();

          if (notaError) {
            console.error('Erro ao criar registro:', notaError);
            toast({
              title: "Erro no banco de dados",
              description: `Erro ao registrar ${file.name}: ${notaError.message}`,
              variant: "destructive",
            });
            continue;
          }

          console.log('=== REGISTRO SALVO COM SUCESSO ===', notaData);
          console.log('🚨 DEBUG: Checando se vai executar processamento automático...');
          console.log('🚨 DEBUG: currentUser existe?', !!currentUser);
          console.log('🚨 DEBUG: currentUser.id:', currentUser?.id);
          console.log('🚨 DEBUG: notaData.id:', notaData.id);
          console.log('🚨 DEBUG: urlData.publicUrl:', urlData.publicUrl);
          successfulUploads++;

          // 🔄 FLUXO AUTOMÁTICO: Disparar processamento IA imediatamente após upload
          try {
            console.log('🚀 INICIANDO PROCESSAMENTO AUTOMÁTICO para:', file.name);
            console.log('📝 Dados do arquivo:', { 
              notaId: notaData.id, 
              isPdf, 
              publicUrl: urlData.publicUrl,
              userId: currentUser.id 
            });
            
            // PROCESSAMENTO SIMPLIFICADO
            console.log('🔥 EXECUTANDO INVOKE DA EDGE FUNCTION...');
            
            const processResponse = await supabase.functions.invoke(
              isPdf ? 'process-danfe-pdf' : 'process-receipt-full',
              {
                body: isPdf ? {
                  pdfUrl: urlData.publicUrl,
                  notaImagemId: notaData.id,
                  userId: currentUser.id
                } : {
                  notaImagemId: notaData.id,
                  imageUrl: urlData.publicUrl,
                  qrUrl: null
                }
              }
            );
            
            console.log('📥 RESPOSTA DA EDGE FUNCTION:', processResponse);

            // Tratamento simples da resposta
            if (processResponse.error?.error === 'NOTA_DUVIDOSA' && processResponse.error.requiresConfirmation) {
              console.log('❓ Nota duvidosa - aguardando confirmação do usuário');
              setNotaDuvidosa({
                message: processResponse.error.message,
                notaImagemId: processResponse.error.notaImagemId
              });
              return;
              
            } else if (processResponse.error?.error === 'NOTA_INVALIDA') {
              console.log('🚫 Nota de serviço rejeitada automaticamente');
              toast({
                title: "❌ Nota rejeitada",
                description: processResponse.error.message,
                variant: "destructive",
              });
              
            } else if (processResponse.error?.error === 'ARQUIVO_INVALIDO') {
              console.log('🚫 Arquivo inválido rejeitado automaticamente');
              toast({
                title: "❌ Arquivo rejeitado",
                description: "Esse arquivo não é uma nota fiscal válida e foi recusado pelo Picotinho.",
                variant: "destructive",
              });
              
            } else if (processResponse.error?.error === 'NOTA_DUPLICADA') {
              console.log('🔄 Nota duplicada rejeitada automaticamente');
              toast({
                title: "Nota já processada",
                description: "👉 Essa nota fiscal já foi processada pelo Picotinho e não pode ser lançada novamente.",
                variant: "destructive",
              });
              
            } else if (processResponse.data?.success) {
              console.log('✅ Processamento concluído com sucesso');
              toast({
                title: "✅ Nota fiscal processada",
                description: `${file.name} foi processada com sucesso pelo Picotinho`,
              });
              
            } else if (processResponse.error) {
              console.log('❌ Erro genérico no processamento:', processResponse.error);
              toast({
                title: "❌ Erro ao processar nota",
                description: processResponse.error.message || `Erro no processamento de ${file.name}`,
                variant: "destructive",
              });
              
            } else {
              console.warn('⚠️ Resposta inesperada da edge function:', processResponse);
              toast({
                title: "⚠️ Status do processamento incerto",
                description: `${file.name} foi enviada, mas o status do processamento é incerto. Verifique sua lista de notas.`,
                variant: "destructive",
              });
            }
            
          } catch (processError: any) {
            console.error('💥 Erro crítico no processamento:', processError);
            toast({
              title: "❌ Erro ao processar nota", 
              description: `Falha no processamento de ${file.name}: ${processError.message}`,
              variant: "destructive",
            });
          }
          
        } catch (fileError) {
          console.error(`ERRO GERAL NO ARQUIVO ${file.name}:`, fileError);
          toast({
            title: "Erro",
            description: `Erro ao processar ${file.name}: ${fileError.message}`,
            variant: "destructive",
          });
        }
      }

      // Só mostrar sucesso se pelo menos um arquivo foi salvo
      if (successfulUploads > 0) {
        toast({
          title: "Sucesso",
          description: `${successfulUploads} arquivo(s) enviado(s) com sucesso`,
        });
        onUploadSuccess();
        setIsDialogOpen(false);
      } else {
        toast({
          title: "Erro",
          description: "Nenhum arquivo foi enviado com sucesso",
          variant: "destructive",
        });
      }
      
      // Limpar input
      event.target.value = '';

    } catch (error) {
      console.error('ERRO GERAL DO PROCESSO:', error);
      toast({
        title: "Erro",
        description: `Erro ao processar arquivos: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center p-4">
        <Button disabled variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Faça login para enviar
        </Button>
      </div>
    );
  }

  return (
    <>
      {notaDuvidosa && (
        <ConfirmacaoNotaDuvidosa
          message={notaDuvidosa.message}
          notaImagemId={notaDuvidosa.notaImagemId}
          onConfirmacao={(success) => {
            setNotaDuvidosa(null);
            if (success) onUploadSuccess();
          }}
        />
      )}
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="default">
            <Upload className="mr-2 h-4 w-4" />
            Enviar Nota Fiscal
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Nota Fiscal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="receipt-upload" className="block text-sm font-medium mb-2">
                Selecione os arquivos da nota fiscal (PDF ou imagem)
              </label>
              <Input
                id="receipt-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Formatos aceitos: PDF, JPEG, PNG, WebP (máximo 50MB cada)
              </p>
            </div>
            
            {uploading && (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enviando e processando...</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UploadNoteButton;