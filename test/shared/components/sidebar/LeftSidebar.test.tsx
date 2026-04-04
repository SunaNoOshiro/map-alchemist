import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import LeftSidebar from '@/shared/components/sidebar/LeftSidebar';
import { AiConfig, AppStatus } from '@/types';

const baseConfig: AiConfig = {
  provider: 'google-gemini',
  textModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  apiKey: '',
  isCustomKey: false,
  iconGenerationMode: 'auto',
};

describe('LeftSidebar', () => {
  it('reveals the AI configuration editor when guest mode prompt requests an API key', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    const onConnectApi = vi.fn();

    render(
      <LeftSidebar
        isOpen
        prompt=""
        setPrompt={vi.fn()}
        onGenerate={vi.fn()}
        status={AppStatus.IDLE}
        styles={[]}
        activeStyleId={null}
        onApplyStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
        onExport={vi.fn()}
        onExportPackage={vi.fn()}
        onExportMaputnik={vi.fn()}
        onPublishMaputnik={vi.fn()}
        onClearGitHubToken={vi.fn()}
        onImport={vi.fn()}
        onClear={vi.fn()}
        logs={[]}
        hasApiKey={false}
        onConnectApi={onConnectApi}
        aiConfig={baseConfig}
        availableTextModels={{ 'gemini-2.5-flash': 'Gemini Flash' }}
        availableImageModels={{ 'gemini-2.5-flash-image': 'Gemini Image' }}
        onUpdateAiConfig={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText(/enter your api key/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /set up api key to generate/i }));

    expect(onConnectApi).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/enter your api key/i)).toBeInTheDocument();
  });
});
