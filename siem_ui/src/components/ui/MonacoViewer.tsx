interface MonacoViewerProps {
  content?: string;
  value?: string; // Alternative to content
  language: 'sql' | 'json' | 'javascript' | 'typescript' | 'yaml';
  height?: string;
  className?: string;
}

/**
 * MonacoViewer - Code viewer with syntax highlighting
 * 
 * A simplified Monaco Editor component for displaying code with syntax highlighting.
 * For now, renders as a simple code block. In production, this would integrate
 * with the Monaco Editor library for full syntax highlighting and editing features.
 * 
 * @example
 * <MonacoViewer 
 *   content="SELECT * FROM events" 
 *   language="sql" 
 *   height="400px"
 *   readOnly 
 * />
 */
export function MonacoViewer({
  content,
  value,
  language,
  height = '300px',
  className,
}: MonacoViewerProps) {
  const displayContent = content || value || '';
  const getLanguageClass = (lang: string) => {
    switch (lang) {
      case 'sql':
        return 'language-sql';
      case 'json':
        return 'language-json';
      case 'javascript':
        return 'language-javascript';
      case 'typescript':
        return 'language-typescript';
      case 'yaml':
        return 'language-yaml';
      default:
        return 'language-text';
    }
  };

  return (
    <div 
      className={`relative w-full border border-border rounded-md overflow-hidden ${className || ''}`}
      style={{ height }}
    >
      <div className="absolute top-2 right-2 z-10">
        <span className="text-xs text-secondary-text bg-card px-2 py-1 rounded border border-border">
          {language.toUpperCase()}
        </span>
      </div>
      
      <pre 
        className={`h-full w-full p-4 overflow-auto text-sm font-mono bg-card text-primary-text ${getLanguageClass(language)}`}
        style={{ 
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
              >
          <code className={getLanguageClass(language)}>
            {displayContent}
          </code>
      </pre>
    </div>
  );
} 