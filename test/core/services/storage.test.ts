import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storageService } from '@core/services/storage';

describe('StorageService', () => {
    beforeEach(() => {
        // Clear IndexedDB mock or localStorage
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should fall back to localStorage migration if IndexedDB is empty', async () => {
        const mockStyles = [{ id: '1', name: 'Test Style' }];
        localStorage.setItem('mapAlchemistStyles', JSON.stringify(mockStyles));

        // We need to mock openDB or just let it fail if not in browser environment
        // But storageService has console logs that we replaced with logger.
        // Let's assume IndexedDB is not available in jsdom by default without polyfill
        // or we mock the internal openDB if it was exported (it's not).

        // Actually, let's just test that it tries to read from localStorage
        const styles = await storageService.getStyles();
        expect(styles).toEqual(mockStyles);
        expect(localStorage.getItem('mapAlchemistStyles')).toBeNull(); // Should be cleared after migration
    });
});
