import { describe, it, expect, vi, beforeEach } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { renderHook, act } from '@testing-library/react';
import { useMapGeneration } from '@features/ai/hooks/useMapGeneration';
import { AppStatus } from '@/types';
import { AiFactory } from '@features/ai/services/AiFactory';

const feature = await loadFeature('./test/features/ai/hooks/MapGeneration.feature');

describeFeature(feature, ({ Scenario }) => {
    Scenario('Generating a new map theme successfully', ({ Given, When, Then, And }) => {
        let addLog = vi.fn();
        let setStyles = vi.fn();
        let setActiveStyleId = vi.fn();
        let onConnectApi = vi.fn();

        const mockNewPreset = {
            id: 'new-id',
            name: 'Cyberpunk Theme',
            mapStyleJson: { version: 8, layers: [] },
            popupStyle: {},
            iconsByCategory: {}
        };

        const mockAiService = {
            generateMapTheme: vi.fn().mockResolvedValue(mockNewPreset),
            generateIconImage: vi.fn().mockResolvedValue('http://mock-icon-url')
        };

        Given('I have a valid API key connected', () => {
            AiFactory.setService(mockAiService as any);
        });

        When('I enter a prompt "Cyberpunk neon city"', () => {
        });

        And('I click the "Generate Theme" button', async () => {
            const { result } = renderHook(() => useMapGeneration({
                addLog,
                setStyles,
                setActiveStyleId,
                styles: [],
                activeStyleId: null,
                aiConfig: {
                    provider: 'google-gemini',
                    model: 'gemini-2.5-flash',
                    apiKey: 'test-api-key',
                    isCustomKey: true
                }
            }));

            await act(async () => {
                await result.current.handleGenerateStyle('Cyberpunk neon city', true, onConnectApi);
            });
        });

        Then('a new map theme should be created', () => {
            expect(setStyles).toHaveBeenCalled();
            expect(setActiveStyleId).toHaveBeenCalled();
        });

        And('the map should display the new theme colors', () => {
            expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Theme generation complete'), 'success');
        });

        And('custom icons should be generated for map categories', () => {
            expect(mockAiService.generateMapTheme).toHaveBeenCalled();
        });

        Then('a new map theme should be created', () => {
            expect(setStyles).toHaveBeenCalled();
            expect(setActiveStyleId).toHaveBeenCalledWith('new-id');
        });

        And('the map should display the new theme colors', () => {
            expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Theme generation complete'), 'success');
        });

        And('custom icons should be generated for map categories', () => {
            expect(mockAiService.generateMapTheme).toHaveBeenCalledWith(
                'Cyberpunk neon city',
                expect.any(Array),
                expect.any(Function)
            );
        });
    });
});
