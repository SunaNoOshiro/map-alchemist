
import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { LogEntry } from '@/types';

interface LogConsoleProps {
  logs: LogEntry[];
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-32 border-t border-gray-700 bg-black p-3 font-mono text-xs overflow-hidden flex flex-col flex-shrink-0">
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        <Terminal size={12} />
        <span className="uppercase font-bold tracking-wider">System Log</span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-thin space-y-1">
        {logs.map((log) => (
          <div key={log.id} className={`break-words leading-tight ${log.type === 'error' ? 'text-red-400' :
              log.type === 'success' ? 'text-green-400' :
                log.type === 'warning' ? 'text-yellow-400' : 'text-gray-400'
            }`}>
            <span className="opacity-40 mr-1">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}]</span>
            {log.message}
          </div>
        ))}
        {logs.length === 0 && <span className="text-gray-700">Ready...</span>}
      </div>
    </div>
  );
};

export default LogConsole;
