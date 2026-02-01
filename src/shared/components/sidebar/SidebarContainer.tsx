
import React, { ReactNode } from 'react';

interface SidebarContainerProps {
  isOpen: boolean;
  width: string; // Tailwind width class (e.g., 'w-80')
  side: 'left' | 'right';
  children: ReactNode;
  onClose?: () => void;
}

const SidebarContainer: React.FC<SidebarContainerProps> = ({ isOpen, width, side, children, onClose }) => {
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  const positionClass = side === 'left' ? 'left-0' : 'right-0';
  const translateClass = isOpen
    ? 'translate-x-0'
    : side === 'left'
      ? '-translate-x-full'
      : 'translate-x-full';
  
  return (
    <>
      {isOpen && onClose && (
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        />
      )}
      <div 
        className={`fixed sm:relative ${positionClass} inset-y-0 z-40 flex-shrink-0 bg-gray-900 ${borderClass} border-gray-700 flex flex-col h-full transform transition-transform duration-300 ease-in-out ${width} ${translateClass} sm:translate-x-0`}
      >
        <div className={`flex flex-col h-full ${width} overflow-y-auto ${!isOpen ? 'invisible sm:visible' : 'visible'}`}>
        {children}
        </div>
      </div>
    </>
  );
};

export default SidebarContainer;
