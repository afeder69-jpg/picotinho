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
        src="/lovable-uploads/001d78d6-0621-4eee-a7c8-d55416f88f4f.png" 
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