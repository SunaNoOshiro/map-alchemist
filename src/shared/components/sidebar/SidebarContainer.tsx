
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
  const widthClass = isOpen ? width : 'w-full sm:w-0';
  const borderVisibilityClass = isOpen ? borderClass : 'border-transparent';
  
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
        className={`fixed sm:relative ${positionClass} inset-y-0 z-40 flex-shrink-0 bg-gray-900 ${borderVisibilityClass} border-gray-700 flex flex-col h-full transform transition-[transform,width] duration-200 ease-out will-change-transform ${widthClass} ${translateClass}`}
      >
        <div
          className={`flex flex-col h-full ${width} overflow-y-auto transition-opacity duration-150 ${
            isOpen ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
        >
          {children}
        </div>
      </div>
    </>
  );
};

export default SidebarContainer;
