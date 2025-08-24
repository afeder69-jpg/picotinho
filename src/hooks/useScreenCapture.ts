import { useState } from 'react';
import { ScreenCaptureService, CapturedImage } from '@/services/screenCapture';

export const useScreenCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);

  const captureFullPage = async (): Promise<CapturedImage | null> => {
    setIsCapturing(true);
    try {
      const image = await ScreenCaptureService.captureFullPage();
      setCapturedImages(prev => [...prev, image]);
      return image;
    } catch (error) {
      console.error('Erro na captura:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const captureReceiptPage = async (): Promise<CapturedImage | null> => {
    setIsCapturing(true);
    try {
      const image = await ScreenCaptureService.captureReceiptPage();
      setCapturedImages(prev => [...prev, image]);
      return image;
    } catch (error) {
      console.error('Erro na captura da nota fiscal:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const captureElement = async (element: HTMLElement): Promise<CapturedImage | null> => {
    setIsCapturing(true);
    try {
      const image = await ScreenCaptureService.captureElement(element);
      setCapturedImages(prev => [...prev, image]);
      return image;
    } catch (error) {
      console.error('Erro na captura do elemento:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const downloadImage = (image: CapturedImage) => {
    ScreenCaptureService.downloadImage(image);
  };

  const clearImages = () => {
    // Libera URLs da memória
    capturedImages.forEach(img => {
      ScreenCaptureService.releaseImageUrl(img.url);
    });
    setCapturedImages([]);
  };

  const removeImage = (timestamp: number) => {
    setCapturedImages(prev => {
      const imageToRemove = prev.find(img => img.timestamp === timestamp);
      if (imageToRemove) {
        ScreenCaptureService.releaseImageUrl(imageToRemove.url);
      }
      return prev.filter(img => img.timestamp !== timestamp);
    });
  };

  return {
    isCapturing,
    capturedImages,
    captureFullPage,
    captureReceiptPage,
    captureElement,
    downloadImage,
    clearImages,
    removeImage
  };
};