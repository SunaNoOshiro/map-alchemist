import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarVisibilityActions from '@/shared/components/sidebar/common/SidebarVisibilityActions';

describe('SidebarVisibilityActions', () => {
  it('applies accent variables to both action buttons when an accent color is provided', () => {
    render(
      <SidebarVisibilityActions
        isVisible
        isIsolated={false}
        onToggle={vi.fn()}
        onShowOnly={vi.fn()}
        entityLabel="Bakery"
        accentColor="#f97316"
      />
    );

    const toggleButton = screen.getByRole('button', { name: /hide bakery on the map/i });
    const isolateButton = screen.getByRole('button', { name: /show only bakery on the map/i });

    expect(toggleButton.style.getPropertyValue('--sidebar-action-accent')).toBe('#f97316');
    expect(toggleButton.style.getPropertyValue('--sidebar-action-bg')).toBe('#f9731624');
    expect(isolateButton.style.getPropertyValue('--sidebar-action-accent')).toBe('#f97316');
    expect(isolateButton.style.getPropertyValue('--sidebar-action-bg')).toBe('#f9731612');
  });

  it('fires both callbacks from the shared action buttons', () => {
    const onToggle = vi.fn();
    const onShowOnly = vi.fn();

    render(
      <SidebarVisibilityActions
        isVisible
        isIsolated={false}
        onToggle={onToggle}
        onShowOnly={onShowOnly}
        entityLabel="Bakery"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /hide bakery on the map/i }));
    fireEvent.click(screen.getByRole('button', { name: /show only bakery on the map/i }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onShowOnly).toHaveBeenCalledTimes(1);
  });
});
