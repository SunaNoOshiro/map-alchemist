import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopToolbar from '@/shared/components/TopToolbar';
import { AppStatus, MapStylePreset } from '@/types';

const baseStyle: Omit<MapStylePreset, 'id' | 'name'> = {
  prompt: 'Prompt',
  createdAt: '2024-01-01T00:00:00.000Z',
  mapStyleJson: {},
  iconsByCategory: {},
  popupStyle: {
    backgroundColor: '#000000',
    textColor: '#ffffff',
    borderColor: '#111111',
    borderRadius: '4px',
    fontFamily: 'Inter',
  },
};

const styles: MapStylePreset[] = [
  { ...baseStyle, id: 'style-1', name: 'Style One' },
  { ...baseStyle, id: 'style-2', name: 'Style Two' },
];

describe('TopToolbar', () => {
  it('closes the style dropdown when clicking outside', () => {
    render(
      <div>
        <TopToolbar
          styles={styles}
          activeStyleId="style-1"
          onSelectStyle={() => undefined}
          status={AppStatus.IDLE}
          isLeftSidebarOpen
          isRightSidebarOpen
          onToggleLeftSidebar={() => undefined}
          onToggleRightSidebar={() => undefined}
        />
        <button type="button">Outside</button>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /style one/i }));
    expect(screen.getByRole('button', { name: /style two/i })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: /outside/i }));
    expect(screen.queryByRole('button', { name: /style two/i })).not.toBeInTheDocument();
  });
});
