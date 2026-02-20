import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AiSettingsPanel from '@/shared/components/sidebar/left/AiSettingsPanel';
import { AiConfig } from '@/types';

const baseConfig: AiConfig = {
  provider: 'google-gemini',
  textModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  apiKey: '',
  isCustomKey: false,
  iconGenerationMode: 'auto',
};

describe('AiSettingsPanel', () => {
  const defaultProps = {
    aiConfig: baseConfig,
    availableTextModels: {
      'gemini-2.5-flash': 'Gemini Flash',
      'gemini-pro': 'Gemini Pro',
    },
    availableImageModels: {
      'gemini-2.5-flash-image': 'Gemini Image',
    },
    onUpdateAiConfig: () => undefined,
    onConnectApi: () => undefined,
    hasApiKey: false,
  };

  it('closes provider dropdown when opening model dropdown', () => {
    render(<AiSettingsPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /^google gemini$/i }));
    expect(screen.getAllByText('Google Gemini').length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole('button', { name: /gemini flash/i })[0]);
    expect(screen.queryByText('Gemini Pro')).toBeInTheDocument();
    expect(screen.getAllByText('Google Gemini')).toHaveLength(1);
  });

  it('closes the model dropdown when clicking outside', () => {
    render(<AiSettingsPanel {...defaultProps} />);

    fireEvent.click(screen.getAllByRole('button', { name: /gemini flash/i })[0]);
    expect(screen.getByText('Gemini Pro')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Gemini Pro')).not.toBeInTheDocument();
  });
});
