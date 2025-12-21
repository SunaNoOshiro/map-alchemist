type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const parseLevel = (level?: string | null): LogLevel | null => {
  if (!level) return null;
  const normalized = level.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVEL_ORDER, normalized)) {
    return normalized as LogLevel;
  }
  return null;
};

const safeLocalStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (err) {
    /* ignore storage availability errors */
  }
  return null;
};

const readLevelForNamespace = (namespace: string): LogLevel | null => {
  const storage = safeLocalStorage();
  const namespaceKey = `mapAlchemistLogLevel:${namespace}`;
  const globalKey = 'mapAlchemistLogLevel';

  const nsLevel = parseLevel(storage?.getItem(namespaceKey));
  if (nsLevel) return nsLevel;

  const globalLevel = parseLevel(storage?.getItem(globalKey));
  if (globalLevel) return globalLevel;

  const envDefault = parseLevel((import.meta as any)?.env?.VITE_LOG_LEVEL);
  return envDefault || 'info';
};

export const setLogLevel = (level: LogLevel, namespace?: string) => {
  const storage = safeLocalStorage();
  if (!storage) return;
  const key = namespace ? `mapAlchemistLogLevel:${namespace}` : 'mapAlchemistLogLevel';
  storage.setItem(key, level);
};

export const clearLogLevel = (namespace?: string) => {
  const storage = safeLocalStorage();
  if (!storage) return;
  const key = namespace ? `mapAlchemistLogLevel:${namespace}` : 'mapAlchemistLogLevel';
  storage.removeItem(key);
};

const shouldLog = (msgLevel: LogLevel, configLevel: LogLevel) => LEVEL_ORDER[msgLevel] <= LEVEL_ORDER[configLevel];

export interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
}

export const createLogger = (namespace: string): Logger => {
  const prefix = `[MapAlchemist][${namespace}]`;

  const logAt = (level: LogLevel, ...args: any[]) => {
    const configuredLevel = readLevelForNamespace(namespace);
    if (!shouldLog(level, configuredLevel)) return;

    const fullPrefix = `[MapAlchemist][${level.toUpperCase()}][${namespace}]`;
    const method = level === 'trace' ? 'debug' : level; // trace funnels to debug in most consoles
    const fn = (console as any)[method] || console.log;
    fn(fullPrefix, ...args);
  };

  return {
    error: (...args: any[]) => logAt('error', ...args),
    warn: (...args: any[]) => logAt('warn', ...args),
    info: (...args: any[]) => logAt('info', ...args),
    debug: (...args: any[]) => logAt('debug', ...args),
    trace: (...args: any[]) => logAt('trace', ...args),
  };
};

export const logLevels = Object.keys(LEVEL_ORDER) as LogLevel[];
