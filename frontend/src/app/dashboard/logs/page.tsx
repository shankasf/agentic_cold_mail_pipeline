'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Terminal,
  Pause,
  Play,
  Trash2,
  Download,
  Search,
  Server,
  Database,
  Bot,
  Mail,
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  Zap,
  Globe,
} from 'lucide-react';

interface LogEntry {
  timestamp: string;
  service: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
  agent?: string;
  tool?: string;
}

// Quick filter presets
const QUICK_FILTERS = [
  { id: 'all', label: 'All Services', services: ['frontend', 'ai', 'redis', 'postgres'], icon: Globe, color: 'bg-gray-600' },
  { id: 'ai', label: 'AI Agents', services: ['ai'], icon: Bot, color: 'bg-purple-600' },
  { id: 'frontend', label: 'Frontend', services: ['frontend'], icon: Server, color: 'bg-blue-600' },
  { id: 'email', label: 'Email Backend', services: ['frontend'], icon: Mail, color: 'bg-orange-600', filter: 'email' },
  { id: 'database', label: 'Database', services: ['postgres', 'redis'], icon: Database, color: 'bg-green-600' },
];

const SERVICE_CONFIG: Record<string, { icon: typeof Server; color: string; bgColor: string; label: string }> = {
  frontend: { icon: Server, color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'Frontend' },
  'ai-service': { icon: Bot, color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'AI' },
  ai: { icon: Bot, color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'AI' },
  agent: { icon: Zap, color: 'text-pink-400', bgColor: 'bg-pink-500/20', label: 'Agent' },
  redis: { icon: Database, color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'Redis' },
  postgres: { icon: Database, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'Postgres' },
  email: { icon: Mail, color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'Email' },
};

const LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string; bgColor: string }> = {
  info: { icon: Info, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  error: { icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500/20' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  debug: { icon: Bug, color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedServices, setSelectedServices] = useState<string[]>(['frontend', 'ai', 'redis', 'postgres']);
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['info', 'error', 'warn', 'debug']);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [messageFilter, setMessageFilter] = useState('');

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  const connectToLogs = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams();
    params.set('services', selectedServices.join(','));
    params.set('levels', selectedLevels.join(','));

    const es = new EventSource(`/api/logs/stream?${params}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected' || data.type === 'heartbeat') {
          return;
        }

        const entry = data as LogEntry;

        if (isPaused) {
          pausedLogsRef.current.push(entry);
        } else {
          setLogs((prev) => {
            const newLogs = [...prev, entry];
            if (newLogs.length > 1000) {
              return newLogs.slice(-1000);
            }
            return newLogs;
          });
        }
      } catch (e) {
        console.error('Error parsing log:', e);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      setTimeout(connectToLogs, 3000);
    };
  }, [selectedServices, selectedLevels, isPaused]);

  useEffect(() => {
    connectToLogs();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connectToLogs]);

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleQuickFilter = (filterId: string) => {
    const filter = QUICK_FILTERS.find(f => f.id === filterId);
    if (filter) {
      setActiveFilter(filterId);
      setSelectedServices(filter.services);
      setMessageFilter(filter.filter || '');
      // Reconnect with new services
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    setLogs((prev) => [...prev, ...pausedLogsRef.current]);
    pausedLogsRef.current = [];
  };

  const handleClear = () => {
    setLogs([]);
  };

  const handleDownload = () => {
    const content = logs
      .map((log) => `[${log.timestamp}] [${log.service}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const toggleExpand = (index: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const filteredLogs = logs.filter((log) => {
    // Search filter
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Message content filter (for email filter)
    if (messageFilter && !log.message.toLowerCase().includes(messageFilter.toLowerCase())) {
      return false;
    }
    // Level filter
    if (!selectedLevels.includes(log.level)) {
      return false;
    }
    return true;
  });

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const getServiceConfig = (service: string) => {
    return SERVICE_CONFIG[service] || SERVICE_CONFIG.frontend;
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-900">Real-time Logs</h1>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
            {isPaused && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                Paused ({pausedLogsRef.current.length})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-2 rounded-lg transition-colors ${
              autoScroll ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
            }`}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          >
            <RefreshCw className={`w-4 h-4 ${autoScroll ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          </button>
          <button
            onClick={() => (isPaused ? handleResume() : setIsPaused(true))}
            className={`p-2 rounded-lg transition-colors ${isPaused ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClear}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Download logs"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {QUICK_FILTERS.map((filter) => {
          const Icon = filter.icon;
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => handleQuickFilter(filter.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                isActive
                  ? `${filter.color} text-white shadow-lg scale-105`
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {filter.label}
            </button>
          );
        })}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300 mx-2" />

        {/* Level Filters */}
        {Object.entries(LEVEL_CONFIG).map(([level, config]) => {
          const Icon = config.icon;
          const isActive = selectedLevels.includes(level);
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? `${config.bgColor} ${config.color} ring-1 ring-current`
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              {level.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search logs... (e.g. 'error', 'email', 'EmailWriter')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-gray-500"
        />
      </div>

      {/* Logs Container */}
      <div
        ref={logsContainerRef}
        className="flex-1 bg-gray-900 rounded-lg overflow-auto font-mono text-sm"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
          if (!isAtBottom && autoScroll) {
            setAutoScroll(false);
          }
        }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Waiting for logs...</p>
              <p className="text-xs mt-1">Select a service filter above to start streaming</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filteredLogs.map((log, index) => {
              const serviceConfig = getServiceConfig(log.service);
              const levelConfig = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
              const ServiceIcon = serviceConfig.icon;
              const LevelIcon = levelConfig.icon;
              const isExpanded = expandedLogs.has(index);
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

              return (
                <div key={index}>
                  <div
                    className={`group flex items-start gap-2 px-2 py-1 hover:bg-gray-800/50 rounded cursor-pointer ${
                      log.level === 'error' ? 'bg-red-900/30' : log.level === 'warn' ? 'bg-yellow-900/20' : ''
                    }`}
                    onClick={() => hasMetadata && toggleExpand(index)}
                  >
                    {/* Timestamp */}
                    <span className="text-gray-500 text-xs whitespace-nowrap font-normal">
                      {formatTimestamp(log.timestamp)}
                    </span>

                    {/* Service Badge */}
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${serviceConfig.bgColor} ${serviceConfig.color} min-w-[70px]`}>
                      <ServiceIcon className="w-3 h-3" />
                      {serviceConfig.label}
                    </span>

                    {/* Agent Badge (if present) */}
                    {log.agent && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-pink-500/20 text-pink-400">
                        <Zap className="w-3 h-3" />
                        {log.agent}
                      </span>
                    )}

                    {/* Level Icon */}
                    <span className={`${levelConfig.color}`}>
                      <LevelIcon className="w-3.5 h-3.5" />
                    </span>

                    {/* Message */}
                    <span className={`flex-1 ${levelConfig.color} break-all`}>
                      {log.message}
                      {hasMetadata && (
                        <span className="ml-2 text-gray-600 opacity-0 group-hover:opacity-100 text-xs">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Expanded Metadata */}
                  {isExpanded && hasMetadata && (
                    <div className="ml-[120px] mb-2 p-2 bg-gray-800 rounded text-xs border-l-2 border-gray-600">
                      <pre className="text-gray-400 overflow-auto max-h-40">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between mt-2 px-2 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{filteredLogs.length} logs displayed</span>
          <span className="text-red-400">{logs.filter((l) => l.level === 'error').length} errors</span>
          <span className="text-yellow-400">{logs.filter((l) => l.level === 'warn').length} warnings</span>
        </div>
        <span>
          Total: {logs.length} • Buffer: 1000 max
        </span>
      </div>
    </div>
  );
}
