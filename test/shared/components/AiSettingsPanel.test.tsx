import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AiSettingsPanel from '@/shared/components/sidebar/left/AiSettingsPanel';
import { AiConfig } from '@/types';

const baseConfig: AiConfig = {
  provider: 'google-gemini',
  model: 'gemini-2.5-flash',
  apiKey: '',
  isCustomKey: false,
};

describe('AiSettingsPanel', () => {
  it('closes the model dropdown when clicking outside', () => {
    render(
      <AiSettingsPanel
        aiConfig={baseConfig}
        availableModels={{
          'gemini-2.5-flash': 'Gemini Flash',
          'gemini-pro': 'Gemini Pro',
        }}
        onUpdateAiConfig={() => undefined}
        onConnectApi={() => undefined}
        hasApiKey={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /gemini flash/i }));
    expect(screen.getByText('Gemini Pro')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Gemini Pro')).not.toBeInTheDocument();
  });
});
