import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AuthScreen from '@/features/auth/components/AuthScreen';

describe('AuthScreen', () => {
  it('closes the model dropdown when clicking outside', () => {
    render(
      <AuthScreen
        onConnect={() => undefined}
        onGuestAccess={() => undefined}
        aiConfig={{ model: 'gemini-2.5-flash', apiKey: '' }}
        availableModels={{
          'gemini-2.5-flash': 'Gemini Flash',
          'gemini-pro': 'Gemini Pro',
        }}
        onUpdateAiConfig={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /gemini flash/i }));
    expect(screen.getByText('Gemini Pro')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Gemini Pro')).not.toBeInTheDocument();
  });
});
