import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PicotinhoLogo from './PicotinhoLogo';
import { Button } from './ui/button';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  onBack?: () => void;
  children?: React.ReactNode;
}

const PageHeader = ({ title, backTo = '/menu', onBack, children }: PageHeaderProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(backTo);
    }
  };

  return (
    <header className="bg-card border-b border-border p-4 sticky top-0 z-10 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        {/* Lado esquerdo: Seta + Logo + Título */}
        <div className="flex items-center gap-2 min-w-0">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            aria-label="Voltar para menu"
            className="flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PicotinhoLogo size="sm" />
          <h1 className="text-lg font-semibold truncate">{title}</h1>
        </div>
        
        {/* Lado direito: Ações customizadas */}
        {children && <div className="flex gap-1.5 flex-shrink-0">{children}</div>}
      </div>
    </header>
  );
};

export default PageHeader;
