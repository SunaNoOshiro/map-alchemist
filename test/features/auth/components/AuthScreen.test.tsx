import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AuthScreen from '@/features/auth/components/AuthScreen';

describe('AuthScreen', () => {
  const defaultProps = {
    onConnect: () => undefined,
    onGuestAccess: () => undefined,
    aiConfig: {
      provider: 'google-gemini' as const,
      textModel: 'gemini-2.5-flash',
      imageModel: 'gemini-2.5-flash-image',
      apiKey: '',
      isCustomKey: false,
      iconGenerationMode: 'auto' as const
    },
    availableTextModels: {
      'gemini-2.5-flash': 'Gemini Flash',
      'gemini-pro': 'Gemini Pro',
    },
    availableImageModels: {
      'gemini-2.5-flash-image': 'Gemini Image',
    },
    onUpdateAiConfig: () => undefined,
  };

  it('closes provider dropdown when opening the model dropdown', () => {
    render(<AuthScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /^google gemini$/i }));
    expect(screen.getAllByText('Google Gemini').length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole('button', { name: /gemini flash/i })[0]);
    expect(screen.queryByText('Gemini Pro')).toBeInTheDocument();
    expect(screen.getAllByText('Google Gemini')).toHaveLength(1);
  });

  it('closes the model dropdown when clicking outside', () => {
    render(<AuthScreen {...defaultProps} />);

    fireEvent.click(screen.getAllByRole('button', { name: /gemini flash/i })[0]);
    expect(screen.getByText('Gemini Pro')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Gemini Pro')).not.toBeInTheDocument();
  });
});
