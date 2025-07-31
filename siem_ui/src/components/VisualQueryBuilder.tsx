import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, Play, X, Info, Zap, Code, Download, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { clsx } from 'clsx';
import { transpileQuery, type TranspilerResult } from '@/services/queryTranspiler';

interface QueryCommand {
  id: string;
  type: 'search' | 'stats' | 'sort' | 'limit' | 'top' | 'where' | 'eval' | 'fields' | 'dedup' | 'head' | 'tail';
  raw: string;
  parsed?: {
    operation?: string;
    field?: string;
    value?: string;
    direction?: 'asc' | 'desc';
    count?: number;
    by?: string[];
  };
}

interface VisualQueryBuilderProps {
  onSearch?: (query: string, sqlQuery: string) => void;
  onQueryChange?: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  initialQuery?: string;
}

/**
 * VisualQueryBuilder - SPL-inspired visual query interface
 * 
 * Features:
 * - Input bar for SPL-style query construction
 * - Visual command pills showing the query pipeline
 * - Real-time parsing and validation
 * - Command type detection and coloring
 * - Export to SQL functionality
 * 
 * Example workflow:
 * 1. User types: event_category = "Network"
 * 2. UI shows: [Filter: event_category = "Network"]
 * 3. User adds: | stats count by dest_ip
 * 4. UI shows: [Filter: event_category = "Network"] → [Stats: count by dest_ip]
 * 
 * @example
 * <VisualQueryBuilder 
 *   onSearch={(query, sql) => console.log('Search:', query, sql)}
 *   placeholder="Enter your search query..."
 * />
 */
export function VisualQueryBuilder({
  onSearch,
  onQueryChange,
  isLoading = false,
  placeholder = "Enter search query (e.g., event_category = \"Network\" | stats count by dest_ip | sort -count | limit 5)",
  initialQuery = ''
}: VisualQueryBuilderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [query, setQuery] = useState(initialQuery);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSqlPreview, setShowSqlPreview] = useState(false);

  // Parse query using transpiler service
  const transpilerResult = useMemo((): TranspilerResult => {
    if (!query.trim()) {
      return {
        sql: 'SELECT * FROM dev.events',
        commands: [],
        isValid: true,
        errors: []
      };
    }
    return transpileQuery(query);
  }, [query]);

  // Convert transpiler commands to UI commands
  const commands = useMemo((): QueryCommand[] => {
    return transpilerResult.commands.map((cmd, index) => ({
      id: `cmd-${index}`,
      type: cmd.type,
      raw: cmd.raw,
      parsed: {
        operation: cmd.parsed.operation,
        field: cmd.parsed.field,
        value: cmd.parsed.condition,
        direction: cmd.parsed.direction,
        count: cmd.parsed.count,
        by: cmd.parsed.by
      }
    }));
  }, [transpilerResult.commands]);



  // Get command display info
  const getCommandInfo = (command: QueryCommand) => {
    switch (command.type) {
      case 'search':
        return {
          label: 'Filter',
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          icon: Search,
          description: command.parsed?.value || command.raw
        };
      case 'stats':
        return {
          label: 'Statistics',
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: Zap,
          description: `${command.parsed?.operation}${command.parsed?.by?.length ? ` by ${command.parsed.by.join(', ')}` : ''}`
        };
      case 'sort':
        return {
          label: 'Sort',
          color: 'bg-purple-100 text-purple-800 border-purple-200',
          icon: Clock,
          description: `${command.parsed?.field} ${command.parsed?.direction === 'desc' ? '↓' : '↑'}`
        };
      case 'limit':
      case 'top':
        return {
          label: 'Limit',
          color: 'bg-orange-100 text-orange-800 border-orange-200',
          icon: Download,
          description: `${command.parsed?.count} rows${command.parsed?.field ? ` by ${command.parsed.field}` : ''}`
        };
      default:
        return {
          label: 'Command',
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: Code,
          description: command.raw
        };
    }
  };

  // Generate SQL preview using transpiler
  const generateSqlPreview = useCallback((): string => {
    return transpilerResult.sql;
  }, [transpilerResult.sql]);

  // Handle query input changes
  const handleQueryChange = (value: string) => {
    setQuery(value);
    onQueryChange?.(value);
  };

  // Handle search execution
  const handleSearch = () => {
    if (!query.trim()) {
      toast({
        title: 'Empty Query',
        description: 'Please enter a search query',
        variant: 'warning',
      });
      return;
    }

    const sqlQuery = generateSqlPreview();
    onSearch?.(query, sqlQuery);
  };

  // Handle command removal
  const handleRemoveCommand = (commandId: string) => {
    const commandIndex = commands.findIndex(cmd => cmd.id === commandId);
    if (commandIndex === -1) return;

    const parts = query.split('|').map(part => part.trim()).filter(Boolean);
    parts.splice(commandIndex, 1);
    const newQuery = parts.join(' | ');
    handleQueryChange(newQuery);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSearch();
    }
  };

  // Auto-expand when typing
  useEffect(() => {
    if (query.length > 50 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [query, isExpanded]);

  return (
    <Card className="w-full">
      <div className="p-4 space-y-4">
        {/* Input Bar */}
        <div className="relative">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={clsx(
                  "w-full pl-10 pr-4 py-2 border border-border rounded-md",
                  "bg-background text-primary-text placeholder-secondary-text",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  "transition-all duration-200",
                  isExpanded ? "min-h-[80px]" : "h-10"
                )}
                style={{ resize: isExpanded ? 'vertical' : 'none' }}
              />
            </div>
            
            <Button
              onClick={handleSearch}
              disabled={!query.trim() || isLoading || !transpilerResult.isValid}
              className="flex items-center space-x-2"
            >
              <Play className="h-4 w-4" />
              <span>Search</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setShowSqlPreview(!showSqlPreview)}
              className="flex items-center space-x-2"
            >
              <Code className="h-4 w-4" />
              <span>SQL</span>
            </Button>
          </div>
        </div>

        {/* Command Pipeline */}
        {commands.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-primary-text">Query Pipeline</span>
              <Badge variant="secondary">{commands.length} command{commands.length !== 1 ? 's' : ''}</Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {commands.map((command, index) => {
                const info = getCommandInfo(command);
                const Icon = info.icon;
                
                return (
                  <React.Fragment key={command.id}>
                    <div className={clsx(
                      "flex items-center space-x-2 px-3 py-2 rounded-lg border",
                      "transition-all duration-200 hover:shadow-sm",
                      info.color
                    )}>
                      <Icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{info.label}</span>
                        <span className="text-xs opacity-75">{info.description}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCommand(command.id)}
                        className="ml-1 hover:bg-black/10 rounded p-1 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    
                    {index < commands.length - 1 && (
                      <div className="text-gray-400">→</div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Query Errors */}
        {transpilerResult.errors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">Query Errors</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              {transpilerResult.errors.map((error, index) => (
                <div key={index} className="text-sm text-red-700">
                  • {error}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SQL Preview */}
        {showSqlPreview && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Code className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-primary-text">Generated SQL</span>
              {!transpilerResult.isValid && (
                <Badge variant="critical">Invalid</Badge>
              )}
            </div>
            <pre className="bg-gray-50 p-3 rounded-md text-sm font-mono overflow-x-auto border">
              {generateSqlPreview()}
            </pre>
          </div>
        )}

        {/* Query Hints */}
        {!query && (
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">SPL-style Query Examples:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <code>event_category = &quot;Network&quot;</code> - Filter events</li>
                  <li>• <code>source_ip = &quot;192.168.1.1&quot; | stats count by dest_ip</code> - Group and count</li>
                  <li>• <code>user = &quot;admin&quot; | sort -timestamp | limit 10</code> - Sort and limit</li>
                  <li>• <code>severity = &quot;Critical&quot; | top 5 dest_ip</code> - Top values</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Command palette or syntax help could go here */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm text-secondary-text">Executing query...</span>
          </div>
        )}
      </div>
    </Card>
  );
}