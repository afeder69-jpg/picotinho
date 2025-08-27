import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface UploadNoteButtonProps {
  onUploadSuccess: () => void;
}

const UploadNoteButton = ({ onUploadSuccess }: UploadNoteButtonProps) => {
  const [uploading, setUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Processar cada arquivo
      for (const file of Array.from(files)) {
        // Validar tipo de arquivo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          toast({
            title: "Erro",
            description: `Tipo de arquivo não suportado: ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

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

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          toast({
            title: "Erro",
            description: `Erro ao fazer upload de ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Obter URL pública do arquivo
        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);

        // Salvar no banco de dados
        const { data: notaData, error: dbError } = await supabase
          .from('notas_imagens')
          .insert({
            usuario_id: user.id,
            imagem_path: filePath,
            imagem_url: urlData.publicUrl,
            processada: false
          })
          .select()
          .single();

        if (dbError) {
          console.error('Erro ao salvar no banco:', dbError);
          toast({
            title: "Erro",
            description: `Erro ao salvar ${file.name} no banco de dados`,
            variant: "destructive",
          });
          continue;
        }

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
              console.error('Erro no processamento:', response.error);
              toast({
                title: "Aviso",
                description: `${file.name} foi salvo, mas houve erro no processamento automático`,
                variant: "default",
              });
            }
          } catch (processError) {
            console.error('Erro no processamento:', processError);
            toast({
              title: "Aviso",
              description: `${file.name} foi salvo, mas houve erro no processamento automático`,
              variant: "default",
            });
          }
        }
      }

      toast({
        title: "Sucesso",
        description: `${files.length} arquivo(s) enviado(s) com sucesso`,
      });

      onUploadSuccess();
      setIsDialogOpen(false);
      
      // Limpar input
      event.target.value = '';

    } catch (error) {
      console.error('Erro geral:', error);
      toast({
        title: "Erro",
        description: "Erro ao processar arquivos",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          Enviar Nota
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
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileUpload}
            disabled={uploading}
            className="cursor-pointer"
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