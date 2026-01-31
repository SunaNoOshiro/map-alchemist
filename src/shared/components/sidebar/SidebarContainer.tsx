
import React, { ReactNode } from 'react';

interface SidebarContainerProps {
  isOpen: boolean;
  width: string; // Tailwind width class (e.g., 'w-80')
  side: 'left' | 'right';
  children: ReactNode;
}

const SidebarContainer: React.FC<SidebarContainerProps> = ({ isOpen, width, side, children }) => {
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  const positionClass = side === 'left' ? 'left-0' : 'right-0';
  const closedTranslate = side === 'left' ? '-translate-x-full' : 'translate-x-full';
  const radiusClass = side === 'left' ? 'rounded-r-2xl md:rounded-none' : 'rounded-l-2xl md:rounded-none';
  
  return (
    <div
      className={`fixed md:relative inset-y-0 ${positionClass} z-40 md:z-0 flex-shrink-0 bg-gray-900 ${borderClass} border-gray-700 flex flex-col h-full transition-all duration-300 ease-in-out shadow-2xl md:shadow-none ${radiusClass}
        ${isOpen ? `${width} translate-x-0` : `w-0 border-none ${closedTranslate}`}
        md:translate-x-0 md:border-gray-700
        ${isOpen ? 'md:w-80' : 'md:w-0'}
        ${isOpen ? 'pointer-events-auto' : 'pointer-events-none md:pointer-events-auto'}
      `}
    >
      <div className={`flex flex-col h-full ${width} overflow-hidden ${!isOpen ? 'invisible md:visible md:opacity-0' : 'visible'} transition-opacity duration-200`}>
        {children}
      </div>
    </div>
  );
};

export default SidebarContainer;
