import React from 'react';

interface PicotinhoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PicotinhoLogo = ({ size = 'md', className = '' }: PicotinhoLogoProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img 
        src="/lovable-uploads/d0696503-d278-461c-8618-c676ca4fcfb7.png" 
        alt="Mascote Picotinho" 
        className={`object-contain ${sizeClasses[size]}`}
      />
      <span className="font-bold text-foreground">
        Picotinho
      </span>
    </div>
  );
};

export default PicotinhoLogo;