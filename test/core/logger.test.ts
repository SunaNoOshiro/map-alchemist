import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '@core/logger';

describe('Logger', () => {
    let logSpy: any;
    let infoSpy: any;
    let debugSpy: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => { });
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        localStorage.clear();
    });

    it('should log info messages when level is info', () => {
        const logger = createLogger('Test');
        logger.info('test message');
        // createLogger uses console.info for 'info'
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[MapAlchemist][INFO][Test]'), 'test message');
    });

    it('should not log debug messages when level is info', () => {
        const logger = createLogger('Test');
        logger.debug('debug message');
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when level is set to debug', () => {
        localStorage.setItem('mapAlchemistLogLevel', 'debug');
        const logger = createLogger('Test');
        logger.debug('debug message');
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[MapAlchemist][DEBUG][Test]'), 'debug message');
    });

    it('should log error messages even when level is info', () => {
        const logger = createLogger('Test');
        logger.error('error message');
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[MapAlchemist][ERROR][Test]'), 'error message');
    });
});
