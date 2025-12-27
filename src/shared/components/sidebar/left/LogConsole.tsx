
import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { LogEntry } from '@/types';
import { getSectionColor } from '@/constants';

interface LogConsoleProps {
  logs: LogEntry[];
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const logRef = useRef<HTMLDivElement>(null);
  const sectionColor = getSectionColor('logs'); // Gray for Logs section

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-gray-900/50 border rounded p-1.5" style={{ borderColor: `${sectionColor}50` }}>
      <div className="flex items-center gap-1 text-gray-500 mb-1">
        <Terminal size={10} style={{ color: sectionColor }} />
        <span className="uppercase font-bold tracking-wider text-[9px]" style={{ color: sectionColor }}>System Log</span>
      </div>
      <div ref={logRef} className="h-32 overflow-y-auto scrollbar-thin space-y-0.5 font-mono text-[9px]">
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
