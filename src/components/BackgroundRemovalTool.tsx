import React, { useState } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { removeBackground, loadImageFromUrl } from '../utils/backgroundRemoval';

interface BackgroundRemovalToolProps {
  onImageProcessed: (processedImageUrl: string) => void;
}

const BackgroundRemovalTool = ({ onImageProcessed }: BackgroundRemovalToolProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const processCurrentPicotinhoImage = async () => {
    setIsProcessing(true);
    try {
      // Load the current Picotinho image
      const imageUrl = '/lovable-uploads/001d78d6-0621-4eee-a7c8-d55416f88f4f.png';
      const imageElement = await loadImageFromUrl(imageUrl);
      
      toast.info('Removendo fundo da imagem...');
      
      // Remove background
      const processedBlob = await removeBackground(imageElement);
      
      // Create a URL for the processed image
      const processedUrl = URL.createObjectURL(processedBlob);
      
      // Create a download link
      const link = document.createElement('a');
      link.href = processedUrl;
      link.download = 'picotinho-sem-fundo.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onImageProcessed(processedUrl);
      toast.success('Fundo removido com sucesso! Download iniciado.');
      
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Erro ao remover o fundo da imagem');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="text-lg font-semibold">Remover Fundo do Picotinho</h3>
      <p className="text-sm text-muted-foreground">
        Clique no botão abaixo para remover o fundo quadriculado da imagem atual do Picotinho.
      </p>
      <Button 
        onClick={processCurrentPicotinhoImage} 
        disabled={isProcessing}
        className="w-full"
      >
        {isProcessing ? 'Processando...' : 'Remover Fundo'}
      </Button>
    </div>
  );
};

export default BackgroundRemovalTool;