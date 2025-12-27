
import React, { ReactNode } from 'react';

interface SidebarContainerProps {
  isOpen: boolean;
  width: string; // Tailwind width class (e.g., 'w-80')
  side: 'left' | 'right';
  children: ReactNode;
}

const SidebarContainer: React.FC<SidebarContainerProps> = ({ isOpen, width, side, children }) => {
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  
  return (
    <div 
      className={`relative flex-shrink-0 bg-gray-900 ${borderClass} border-gray-700 flex flex-col h-full transition-all duration-300 ease-in-out ${isOpen ? width : 'w-0 border-none'}`}
    >
      <div className={`flex flex-col h-full ${width} overflow-y-auto ${!isOpen ? 'invisible' : 'visible'}`}>
        {children}
      </div>
    </div>
  );
};

export default SidebarContainer;
