import html2canvas from 'html2canvas';
import { toast } from '@/hooks/use-toast';

export interface CapturedImage {
  blob: Blob;
  url: string;
  timestamp: number;
  filename: string;
}

export class ScreenCaptureService {
  /**
   * Captura toda a página atual como imagem
   */
  static async captureFullPage(): Promise<CapturedImage> {
    try {
      toast({
        title: "Capturando tela...",
        description: "Aguarde enquanto processamos a imagem.",
      });

      const canvas = await html2canvas(document.body, {
        height: window.innerHeight,
        width: window.innerWidth,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        scale: 1,
        logging: false,
        backgroundColor: '#ffffff'
      });

      return this.processCanvas(canvas, 'full-page');
    } catch (error) {
      console.error('Erro ao capturar tela completa:', error);
      toast({
        title: "Erro na captura",
        description: "Não foi possível capturar a tela. Tente novamente.",
        variant: "destructive",
      });
      throw error;
    }
  }

  /**
   * Captura um elemento específico da página
   */
  static async captureElement(element: HTMLElement): Promise<CapturedImage> {
    try {
      toast({
        title: "Capturando elemento...",
        description: "Processando área selecionada.",
      });

      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        scale: 2, // Maior qualidade para elementos específicos
        logging: false,
        backgroundColor: '#ffffff'
      });

      return this.processCanvas(canvas, 'element');
    } catch (error) {
      console.error('Erro ao capturar elemento:', error);
      toast({
        title: "Erro na captura",
        description: "Não foi possível capturar o elemento selecionado.",
        variant: "destructive",
      });
      throw error;
    }
  }

  /**
   * Captura a página da nota fiscal da Receita Federal
   * Otimizado para capturar especificamente conteúdo de notas fiscais
   */
  static async captureReceiptPage(): Promise<CapturedImage> {
    try {
      toast({
        title: "Capturando nota fiscal...",
        description: "Processando dados da Receita Federal.",
      });

      // Procura por containers comuns de nota fiscal
      const possibleContainers = [
        'div[class*="nota"]',
        'div[class*="fiscal"]', 
        'div[class*="nfe"]',
        'div[class*="danfe"]',
        'main',
        '.container',
        '#content',
        'body'
      ];

      let targetElement = document.body;
      
      for (const selector of possibleContainers) {
        const element = document.querySelector(selector) as HTMLElement;
        if (element && element.offsetHeight > 200) {
          targetElement = element;
          break;
        }
      }

      const canvas = await html2canvas(targetElement, {
        height: Math.max(targetElement.scrollHeight, window.innerHeight),
        width: Math.max(targetElement.scrollWidth, window.innerWidth),
        useCORS: true,
        allowTaint: true,
        scale: 1.5, // Boa qualidade para OCR posterior
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0
      });

      const result = await this.processCanvas(canvas, 'nota-fiscal');
      
      toast({
        title: "Captura realizada!",
        description: "Nota fiscal capturada com sucesso.",
      });

      return result;
    } catch (error) {
      console.error('Erro ao capturar nota fiscal:', error);
      toast({
        title: "Erro na captura",
        description: "Não foi possível capturar a nota fiscal.",
        variant: "destructive",
      });
      throw error;
    }
  }

  /**
   * Processa o canvas e retorna a imagem
   */
  private static async processCanvas(canvas: HTMLCanvasElement, type: string): Promise<CapturedImage> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Falha ao gerar imagem'));
          return;
        }

        const timestamp = Date.now();
        const filename = `${type}-${timestamp}.png`;
        const url = URL.createObjectURL(blob);

        resolve({
          blob,
          url,
          timestamp,
          filename
        });
      }, 'image/png', 0.9);
    });
  }

  /**
   * Salva a imagem no dispositivo
   */
  static downloadImage(capturedImage: CapturedImage) {
    const link = document.createElement('a');
    link.download = capturedImage.filename;
    link.href = capturedImage.url;
    link.click();
    
    toast({
      title: "Download iniciado",
      description: `Imagem salva como ${capturedImage.filename}`,
    });
  }

  /**
   * Libera a memória da URL
   */
  static releaseImageUrl(url: string) {
    URL.revokeObjectURL(url);
  }
}