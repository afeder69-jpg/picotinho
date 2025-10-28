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
      src="/app-icon.png" 
      alt="Mascote Picotinho" 
      className={`object-contain ${sizeClasses[size]} ${className}`}
    />
  );
};

export default PicotinhoLogo;