import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppAuth } from '@/features/auth/hooks/useAppAuth';

describe('useAppAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('hydrates a saved API key into ready auth state', async () => {
    localStorage.setItem('mapAlchemistAiConfig', JSON.stringify({
      provider: 'openai',
      textModel: 'gpt-4o-mini',
      imageModel: 'gpt-image-1-mini',
      apiKey: 'sk-test',
      isCustomKey: true,
      iconGenerationMode: 'auto'
    }));

    const addLog = vi.fn();
    const { result } = renderHook(() => useAppAuth(addLog));

    await waitFor(() => expect(result.current.isAuthReady).toBe(true));

    expect(result.current.aiConfig.provider).toBe('openai');
    expect(result.current.aiConfig.apiKey).toBe('sk-test');
    expect(result.current.hasApiKey).toBe(true);
  });

  it('refuses to connect when no usable API key is provided', async () => {
    const addLog = vi.fn();
    const { result } = renderHook(() => useAppAuth(addLog));

    await waitFor(() => expect(result.current.isAuthReady).toBe(true));

    act(() => {
      result.current.handleSelectKey();
    });

    expect(result.current.hasApiKey).toBe(false);
    expect(addLog).toHaveBeenCalledWith(
      'Enter an API key in AI Configuration before continuing.',
      'warning'
    );
  });

  it('accepts an immediate API key override from the auth screen', async () => {
    const addLog = vi.fn();
    const { result } = renderHook(() => useAppAuth(addLog));

    await waitFor(() => expect(result.current.isAuthReady).toBe(true));

    act(() => {
      result.current.handleSelectKey('sk-live');
    });

    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.isGuestMode).toBe(false);
    expect(addLog).toHaveBeenCalledWith('API key connected successfully.', 'success');
  });
});
