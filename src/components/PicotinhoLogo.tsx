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
    <img 
      src="/lovable-uploads/62443b56-2f57-4ca1-8797-db67febf5108.png" 
      alt="Mascote Picotinho" 
      className={`object-contain ${sizeClasses[size]} ${className}`}
    />
  );
};

export default PicotinhoLogo;