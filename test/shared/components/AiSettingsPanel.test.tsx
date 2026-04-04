import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AiSettingsPanel from '@/shared/components/sidebar/left/AiSettingsPanel';
import { AiConfig } from '@/types';
import { getIconGenerationModeDescription } from '@/constants/aiConstants';
import { getSectionColor } from '@/constants';

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

  it('shows OpenAI provider in provider dropdown', () => {
    render(<AiSettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^google gemini$/i }));
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('shows hovered mode explanation while choosing icon generation mode', () => {
    render(<AiSettingsPanel {...defaultProps} />);

    const trigger = screen.getByTestId('icon-generation-mode-trigger');
    fireEvent.click(trigger);

    const description = screen.getByTestId('icon-generation-mode-description');
    expect(description).toHaveTextContent(getIconGenerationModeDescription('google-gemini', 'auto'));

    const batchOption = screen.getByTestId('icon-generation-mode-option-batch-async');
    fireEvent.mouseEnter(batchOption);
    expect(description).toHaveTextContent(getIconGenerationModeDescription('google-gemini', 'batch-async'));

    const atlasOption = screen.getByTestId('icon-generation-mode-option-atlas');
    fireEvent.mouseEnter(atlasOption);
    expect(description).toHaveTextContent(getIconGenerationModeDescription('google-gemini', 'atlas'));
  });

  it('shows inline API key entry when no key is available', () => {
    render(<AiSettingsPanel {...defaultProps} />);

    expect(screen.getByPlaceholderText(/enter your api key/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^connect api key$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enter manually/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-ai-summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save key/i })).toHaveStyle({
      color: getSectionColor('ai-config')
    });
  });

  it('saves a trimmed API key and notifies auth when the inline form is submitted', () => {
    const onConnectApi = vi.fn();
    const onUpdateAiConfig = vi.fn();
    render(
      <AiSettingsPanel
        {...defaultProps}
        onConnectApi={onConnectApi}
        onUpdateAiConfig={onUpdateAiConfig}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/enter your api key/i), {
      target: { value: '  test-api-key  ' },
    });
    const saveButton = screen.getByRole('button', { name: /save key/i });
    expect(saveButton).toHaveStyle({
      backgroundColor: getSectionColor('ai-config'),
      color: '#ffffff'
    });

    fireEvent.click(saveButton);

    expect(onUpdateAiConfig).toHaveBeenCalledWith({ apiKey: 'test-api-key', isCustomKey: true });
    expect(onConnectApi).toHaveBeenCalledWith('test-api-key');
  });

  it('uses the AI section accent for save and cancel actions', () => {
    render(
      <AiSettingsPanel
        {...defaultProps}
        aiConfig={{
          ...baseConfig,
          apiKey: 'stored-api-key',
          isCustomKey: true,
        }}
        hasApiKey
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByRole('button', { name: /save key/i })).toHaveStyle({
      backgroundColor: getSectionColor('ai-config'),
      color: '#ffffff'
    });
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveStyle({
      color: getSectionColor('ai-config')
    });
  });
});
