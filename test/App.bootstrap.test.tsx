import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { AppStatus } from '@/types';

const useAppAuthMock = vi.fn();
const useStyleManagerMock = vi.fn();
const useMapGenerationMock = vi.fn();

vi.mock('@features/auth/hooks/useAppAuth', () => ({
  useAppAuth: (...args: unknown[]) => useAppAuthMock(...args)
}));

vi.mock('@features/styles/hooks/useStyleManager', () => ({
  useStyleManager: (...args: unknown[]) => useStyleManagerMock(...args)
}));

vi.mock('@features/ai/hooks/useMapGeneration', () => ({
  useMapGeneration: (...args: unknown[]) => useMapGenerationMock(...args)
}));

vi.mock('@features/auth/components/AuthScreen', () => ({
  default: () => <div data-testid="auth-screen-mock">Auth Screen</div>
}));

vi.mock('@shared/layouts/MainLayout', () => ({
  MainLayout: () => <div data-testid="main-layout-mock">Main Layout</div>
}));

const baseAuthState = {
  isAuthReady: true,
  hasApiKey: true,
  isGuestMode: false,
  setIsGuestMode: vi.fn(),
  handleSelectKey: vi.fn(),
  aiConfig: {
    provider: 'google-gemini',
    textModel: 'gemini-2.5-flash',
    imageModel: 'gemini-2.5-flash-image',
    apiKey: '',
    isCustomKey: false,
    iconGenerationMode: 'auto'
  },
  availableTextModels: {},
  availableImageModels: {},
  updateAiConfig: vi.fn(),
  validateApiKey: vi.fn(() => true)
};

const baseStyleState = {
  styles: [],
  setStyles: vi.fn(),
  activeStyleId: 'style-1',
  setActiveStyleId: vi.fn(),
  isStylesReady: true,
  defaultThemeIds: ['style-1'],
  maputnikPublishStage: 'idle',
  maputnikPublishInfo: null,
  maputnikPublishError: null,
  maputnikDemoPoisEnabled: true,
  setMaputnikDemoPoisEnabled: vi.fn(),
  handleExport: vi.fn(),
  handleImport: vi.fn(),
  handleClear: vi.fn(),
  handleDeleteStyle: vi.fn(),
  handleExportPackage: vi.fn(),
  handleExportMaputnik: vi.fn(),
  handleOpenPublishMaputnik: vi.fn(),
  handleConfirmPublishMaputnik: vi.fn(),
  handleClosePublishMaputnik: vi.fn(),
  handleClearGitHubToken: vi.fn()
};

const baseMapGenerationState = {
  status: AppStatus.IDLE,
  loadingMessage: '',
  handleGenerateStyle: vi.fn(),
  handleRegenerateIcon: vi.fn()
};

describe('App bootstrap behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppAuthMock.mockReturnValue({ ...baseAuthState });
    useStyleManagerMock.mockReturnValue({ ...baseStyleState });
    useMapGenerationMock.mockReturnValue({ ...baseMapGenerationState });
  });

  it('shows the bootstrap shell while auth state is still initializing', () => {
    useAppAuthMock.mockReturnValue({
      ...baseAuthState,
      isAuthReady: false,
      hasApiKey: false
    });

    render(<App />);

    expect(screen.getByTestId('app-bootstrap-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-screen-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('main-layout-mock')).not.toBeInTheDocument();
  });

  it('shows the auth screen once auth initialization completes without credentials', () => {
    useAppAuthMock.mockReturnValue({
      ...baseAuthState,
      hasApiKey: false,
      isGuestMode: false
    });

    render(<App />);

    expect(screen.getByTestId('auth-screen-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('app-bootstrap-shell')).not.toBeInTheDocument();
  });

  it('keeps the bootstrap shell visible until styles finish rehydrating', () => {
    useStyleManagerMock.mockReturnValue({
      ...baseStyleState,
      isStylesReady: false
    });

    render(<App />);

    expect(screen.getByTestId('app-bootstrap-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('main-layout-mock')).not.toBeInTheDocument();
  });

  it('renders the main layout once auth and styles are both ready', () => {
    render(<App />);

    expect(screen.getByTestId('main-layout-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('app-bootstrap-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-screen-mock')).not.toBeInTheDocument();
  });
});
