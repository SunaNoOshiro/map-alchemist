import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMapGeneration } from '@/features/ai/hooks/useMapGeneration';
import { AiFactory } from '@/features/ai/services/AiFactory';

describe('useMapGeneration invalid API key handling', () => {
  it('shows a clear invalid-key message and opens API connect flow', async () => {
    const addLog = vi.fn();
    const setStyles = vi.fn();
    const setActiveStyleId = vi.fn();
    const onConnectApi = vi.fn();

    AiFactory.setService({
      generateMapTheme: vi.fn().mockRejectedValue(new Error('Invalid Gemini API key. Update API key in AI Configuration and try again.')),
      generateIconImage: vi.fn(),
    } as any);

    const { result } = renderHook(() => useMapGeneration({
      addLog,
      setStyles,
      setActiveStyleId,
      styles: [],
      activeStyleId: null,
      aiConfig: {
        provider: 'google-gemini',
        textModel: 'gemini-2.5-flash',
        imageModel: 'gemini-2.5-flash-image',
        apiKey: 'bad-key',
        isCustomKey: true,
        iconGenerationMode: 'auto',
      },
    }));

    await act(async () => {
      await result.current.handleGenerateStyle('my prompt', true, onConnectApi);
    });

    expect(addLog).toHaveBeenCalledWith(
      'Invalid API key. Reconnect a valid key in AI Configuration.',
      'error'
    );
    expect(onConnectApi).toHaveBeenCalledTimes(1);
    expect(setStyles).not.toHaveBeenCalled();

    AiFactory.clearInstance();
  });
});
