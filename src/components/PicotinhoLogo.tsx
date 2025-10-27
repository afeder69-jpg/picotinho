import React from 'react';

interface PicotinhoLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const PicotinhoLogo = ({ size = 'md', className = '' }: PicotinhoLogoProps) => {
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-5 h-5',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
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