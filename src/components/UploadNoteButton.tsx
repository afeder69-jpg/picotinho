import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/AuthProvider';

interface UploadNoteButtonProps {
  onUploadSuccess: () => void;
}

const UploadNoteButton = ({ onUploadSuccess }: UploadNoteButtonProps) => {
  const [uploading, setUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('=== INICIANDO PROCESSO DE UPLOAD ===');
    
    const files = event.target.files;
    console.log('Arquivos selecionados:', files);
    console.log('Quantidade de arquivos:', files?.length || 0);
    
    if (!files || files.length === 0) {
      console.log('ERRO: Nenhum arquivo selecionado');
      toast({
        title: "Erro",
        description: "Nenhum arquivo foi selecionado",
        variant: "destructive",
      });
      return;
    }

    // Log detalhado de cada arquivo
    Array.from(files).forEach((file, index) => {
      console.log(`Arquivo ${index + 1}:`, {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });
    });

    if (!user) {
      console.log('ERRO: Usuário não logado');
      toast({
        title: "Erro",
        description: "Você precisa estar logado para enviar notas fiscais",
        variant: "destructive",
      });
      return;
    }

    console.log('Usuário logado:', user.id);
    setUploading(true);
    let successfulUploads = 0;
    
    try {
      // Processar cada arquivo
      for (const file of Array.from(files)) {
        try {
          console.log('=== INICIANDO UPLOAD ===', file.name);
          
          // Validar tipo de arquivo - incluindo PDFs com tipos MIME alternativos para Android
          const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
          const allowedPdfTypes = [
            'application/pdf',
            'application/x-pdf', 
            'application/acrobat',
            'applications/vnd.pdf',
            'text/pdf',
            'text/x-pdf'
          ];
          const allowedTypes = [...allowedImageTypes, ...allowedPdfTypes];
          const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
          const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
          
          console.log('Validando arquivo:', {
            fileName: file.name,
            type: file.type,
            extension: fileExtension,
            size: file.size,
            allowedTypes,
            allowedExtensions
          });
          
          // Verificação mais flexível para PDFs no Android
          const isImage = allowedImageTypes.includes(file.type) || ['.jpg', '.jpeg', '.png', '.webp'].includes(fileExtension);
          const isPdf = allowedPdfTypes.includes(file.type) || fileExtension === '.pdf' || file.type === '' && fileExtension === '.pdf';
          const isValidFile = isImage || isPdf;
          
          if (!isValidFile) {
            console.log('ARQUIVO REJEITADO:', {
              type: file.type,
              extension: fileExtension,
              isImage,
              isPdf
            });
            toast({
              title: "Erro",
              description: `Tipo de arquivo não suportado: ${file.name}. Use JPG, PNG, WebP ou PDF.`,
              variant: "destructive",
            });
            continue;
          }
          
          console.log('Arquivo aceito:', {
            name: file.name,
            type: file.type,
            isImage,
            isPdf
          });

          // Validar tamanho (máximo 10MB)
          if (file.size > 10 * 1024 * 1024) {
            toast({
              title: "Erro",
              description: `Arquivo muito grande: ${file.name}. Máximo 10MB.`,
              variant: "destructive",
            });
            continue;
          }

          // Upload para o storage
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
          const filePath = `${user.id}/${fileName}`;
          
          console.log('Fazendo upload para storage:', filePath);

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(filePath, file);

          if (uploadError) {
            console.error('ERRO NO UPLOAD STORAGE:', uploadError);
            toast({
              title: "Erro",
              description: `Erro ao fazer upload de ${file.name}: ${uploadError.message}`,
              variant: "destructive",
            });
            continue;
          }
          
          console.log('Upload storage SUCESSO:', uploadData);

          // Obter URL pública do arquivo
          const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);
            
          console.log('URL pública gerada:', urlData.publicUrl);

          // Verificar autenticação antes de inserir
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (!currentUser) {
            console.error('USUÁRIO NÃO AUTENTICADO');
            toast({
              title: "Erro",
              description: "Usuário não autenticado. Faça login novamente.",
              variant: "destructive",
            });
            continue;
          }
          
          console.log('Usuário autenticado:', currentUser.id);

          // Salvar no banco de dados
          const insertData = {
            usuario_id: currentUser.id,
            imagem_path: filePath,
            imagem_url: urlData.publicUrl,
            processada: false
          };
          
          console.log('=== INSERINDO NO BANCO ===', insertData);

          const { data: notaData, error: dbError } = await supabase
            .from('notas_imagens')
            .insert(insertData)
            .select()
            .maybeSingle();

          console.log('=== RESULTADO INSERT ===', { notaData, dbError });

          if (dbError) {
            console.error('ERRO NO BANCO:', dbError);
            toast({
              title: "Erro de Banco",
              description: `Erro ao salvar ${file.name}: ${dbError.message}`,
              variant: "destructive",
            });
            continue;
          }

          if (!notaData) {
            console.error('NENHUM DADO RETORNADO DO BANCO');
            toast({
              title: "Erro",
              description: `Falha ao salvar ${file.name}: nenhum dado retornado`,
              variant: "destructive",
            });
            continue;
          }

          console.log('=== REGISTRO SALVO COM SUCESSO ===', notaData);
          successfulUploads++;

          // Processar com IA se for imagem
          if (file.type.startsWith('image/')) {
            try {
              const response = await supabase.functions.invoke('process-receipt-full', {
                body: {
                  notaImagemId: notaData.id,
                  imageUrl: urlData.publicUrl,
                  qrUrl: null
                }
              });

              if (response.error) {
                console.error('Erro no processamento IA:', response.error);
                toast({
                  title: "Aviso",
                  description: `${file.name} foi salvo, mas houve erro no processamento automático`,
                  variant: "default",
                });
              }
            } catch (processError) {
              console.error('Erro no processamento IA:', processError);
              toast({
                title: "Aviso",
                description: `${file.name} foi salvo, mas houve erro no processamento automático`,
                variant: "default",
              });
            }
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

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          className="w-full"
          disabled={!user}
        >
          <Upload className="w-4 h-4 mr-2" />
          {user ? 'Enviar Nota' : 'Faça login para enviar'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Nota Fiscal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione uma ou mais imagens da nota fiscal, ou um arquivo PDF.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Arquivos aceitos:</label>
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              <li>Imagens: JPEG, PNG, WebP (máx. 10MB cada)</li>
              <li>PDF gerado pelo navegador (máx. 10MB)</li>
              <li>Múltiplos arquivos da mesma nota</li>
            </ul>
          </div>
          <Input
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf"
            onChange={handleFileUpload}
            disabled={uploading}
            className="cursor-pointer"
            capture={false}
          />
          {uploading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm">Enviando e processando...</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadNoteButton;