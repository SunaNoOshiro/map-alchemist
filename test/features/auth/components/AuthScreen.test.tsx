import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AuthScreen from '@/features/auth/components/AuthScreen';

describe('AuthScreen', () => {
  const defaultProps = {
    onConnect: () => undefined,
    onGuestAccess: () => undefined,
    aiConfig: { provider: 'google-gemini' as const, model: 'gemini-2.5-flash', apiKey: '', isCustomKey: false },
    availableModels: {
      'gemini-2.5-flash': 'Gemini Flash',
      'gemini-pro': 'Gemini Pro',
    },
    onUpdateAiConfig: () => undefined,
  };

  it('closes provider dropdown when opening the model dropdown', () => {
    render(<AuthScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /^google gemini$/i }));
    expect(screen.getAllByText('Google Gemini').length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: /gemini flash/i }));
    expect(screen.queryByText('Gemini Pro')).toBeInTheDocument();
    expect(screen.getAllByText('Google Gemini')).toHaveLength(1);
  });

  it('closes the model dropdown when clicking outside', () => {
    render(<AuthScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /gemini flash/i }));
    expect(screen.getByText('Gemini Pro')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Gemini Pro')).not.toBeInTheDocument();
  });
});
