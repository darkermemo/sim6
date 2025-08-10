import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSchemaFields, useFacetSuggestions, useTenants, useLatestEvents } from '../lib/query'
import { FixedSizeList as List } from 'react-window'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Search as SearchIcon, Play, Square, Download, Save, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface SearchResult {
  event_timestamp?: number
  created_at?: number
  tenant_id?: string
  message?: string
  severity?: string
  source_ip?: string
  event_outcome?: string
  [key: string]: any
}

interface FacetData {
  by_severity: Array<{ severity: string; c: number }>
  timeline: Array<{ ts: string; c: number }>
  by_outcome: Array<{ event_outcome: string; c: number }>
  top_sources: Array<{ source_ip: string; c: number }>
}

export default function SearchPage() {
  const [selectedTenants, setSelectedTenants] = useState<string[]>(['default'])
  const [field, setField] = useState('')
  const [op, setOp] = useState('contains_any')
  const [val, setVal] = useState('')
  const [text, setText] = useState('')
  const [timeRange, setTimeRange] = useState(24 * 3600) // 24 hours in seconds
  const [limit] = useState(200)
  const [results, setResults] = useState<SearchResult[]>([])
  const [facets, setFacets] = useState<FacetData | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<SearchResult | null>(null)
  const [showInspector, setShowInspector] = useState(false)
  const [tailMode, setTailMode] = useState(false)
  const [showSavedDialog, setShowSavedDialog] = useState(false)
  const [searchName, setSearchName] = useState('')
  const listRef = useRef<List>(null)

  const { data: fields } = useSchemaFields()
  const { data: tenantsData } = useTenants()
  const allTenants = (tenantsData?.tenants || []).map(t => t.id)

  // Build the query string by merging field/operator/value with text search
  const buildQueryString = useCallback(() => {
    const parts: string[] = []
    
    // Add text search if present
    if (text.trim()) {
      const tokens = text.split(',').map(s => s.trim()).filter(Boolean)
      if (tokens.length > 0) {
        parts.push(`message:(${tokens.join(' OR ')})`)
      }
    }
    
    // Add field-based search if present
    if (field && op && val) {
      const tokens = val.split(',').map(s => s.trim()).filter(Boolean)
      if (tokens.length > 0) {
        if (op === 'contains_any') {
          parts.push(`${field}:(${tokens.join(' OR ')})`)
        } else if (op === 'contains') {
          parts.push(`${field}:*${val}*`)
        } else if (op === 'eq') {
          parts.push(`${field}:"${val}"`)
        } else if (op === 'ipincidr') {
          parts.push(`${field}:${val}`)
        }
      }
    }
    
    return parts.join(' AND ')
  }, [text, field, op, val])

  const searchBody = useMemo(() => ({
    tenant_id: selectedTenants[0] || 'default',
    time: { last_seconds: timeRange },
    q: buildQueryString(),
    limit,
    offset: 0
  }), [selectedTenants, timeRange, buildQueryString, limit])

  const { data: suggestions } = useFacetSuggestions(searchBody, field, val)
  const latest = useLatestEvents(selectedTenants, 200)

  useEffect(() => {
    if (!field && fields?.length) {
      setField(fields[0].name)
    }
  }, [fields, field])

  // Execute search
  const executeSearch = async () => {
    try {
      setRunning(true)
      setError(null)
      
      const response = await fetch('/api/v2/search/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(searchBody)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      const rows = data?.data?.data || []
      setResults(rows)
      
      // Fetch facets
      await fetchFacets()
      
    } catch (err: any) {
      setError(err?.message || 'Search failed')
    } finally {
      setRunning(false)
    }
  }

  // Fetch facets/aggregations
  const fetchFacets = async () => {
    try {
      const response = await fetch('/api/v2/search/aggs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(searchBody)
      })
      
      if (response.ok) {
        const data = await response.json()
        setFacets(data.aggs)
      }
    } catch (err) {
      console.warn('Failed to fetch facets:', err)
    }
  }

  // Start tail mode
  const startTail = async () => {
    setTailMode(true)
    // TODO: Implement SSE connection to /api/v2/search/tail
  }

  // Stop tail mode
  const stopTail = () => {
    setTailMode(false)
  }

  // Save search
  const saveSearch = async () => {
    if (!searchName.trim()) return
    
    try {
      const response = await fetch('/api/v2/search/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: searchName,
          query: searchBody
        })
      })
      
      if (response.ok) {
        // const saved = await response.json() // This line was removed
        setShowSavedDialog(false)
        setSearchName('')
      }
    } catch (err) {
      setError('Failed to save search')
    }
  }

  // Export results
  const exportResults = async () => {
    try {
      const response = await fetch('/api/v2/search/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(searchBody)
      })
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'search_results.ndjson'
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      setError('Export failed')
    }
  }

  // Row renderer for virtualized list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = results[index] || latest.data?.rows?.[index]
    if (!row) return null
    
    return (
      <div 
        style={style} 
        className={`flex border-b border-gray-700 hover:bg-gray-800 cursor-pointer ${selectedRow === row ? 'bg-blue-900' : ''}`}
        onClick={() => setSelectedRow(row)}
      >
        <div className="flex-1 p-3 text-sm">
          <div className="font-mono text-xs text-gray-400">
            {formatTimestamp(row.event_timestamp ?? row.created_at)}
          </div>
        </div>
        <div className="flex-1 p-3 text-sm">
          <span className="text-gray-300">{row.tenant_id || ''}</span>
        </div>
        <div className="flex-1 p-3 text-sm">
          <div className="truncate">{String(row.message || '')}</div>
          {row.severity && (
            <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
              row.severity === 'Critical' ? 'bg-red-900 text-red-100' :
              row.severity === 'High' ? 'bg-orange-900 text-orange-100' :
              row.severity === 'Medium' ? 'bg-yellow-900 text-yellow-100' :
              'bg-gray-700 text-gray-100'
            }`}>
              {row.severity}
            </span>
          )}
        </div>
      </div>
    )
  }, [results, latest.data?.rows, selectedRow])

  const formatTimestamp = (timestamp: any) => {
    const n = Number(timestamp)
    if (!n) return ''
    const ms = String(n).length === 10 ? n * 1000 : n
    try {
      return new Date(ms).toISOString().replace('T', ' ').replace('Z', '')
    } catch {
      return String(timestamp)
    }
  }

  const timeRangeOptions = [
    { label: '1 Hour', value: 3600 },
    { label: '6 Hours', value: 6 * 3600 },
    { label: '24 Hours', value: 24 * 3600 },
    { label: '7 Days', value: 7 * 24 * 3600 },
    { label: '30 Days', value: 30 * 24 * 3600 }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search & Investigation</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSavedDialog(true)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-2"
          >
            <Save size={16} />
            Save Search
          </button>
          <button
            onClick={exportResults}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Search Form */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tenants</label>
            <select
              multiple
              size={Math.min(6, Math.max(3, allTenants.length))}
              value={selectedTenants}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map(o => o.value)
                setSelectedTenants(opts.length ? opts : ['default'])
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              {allTenants.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              {timeRangeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              {fields?.map(f => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Operator</label>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="contains_any">Contains Any</option>
              <option value="contains">Contains</option>
              <option value="eq">Equals</option>
              <option value="ipincidr">IP in CIDR</option>
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Value</label>
            <input
              placeholder="Type to see suggestions"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              list="facet-values"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            />
            <datalist id="facet-values">
              {suggestions?.map((s, idx) => (
                <option key={`${s}-${idx}`} value={s} />
              ))}
            </datalist>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Text Search (Message)</label>
            <input
              placeholder="Comma-separated tokens, e.g. fail,error"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={executeSearch}
            disabled={running}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg flex items-center gap-2"
          >
            {running ? <RefreshCw size={16} className="animate-spin" /> : <SearchIcon size={16} />}
            {running ? 'Running...' : 'Run Search'}
          </button>
          
          <button
            onClick={startTail}
            disabled={tailMode}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg flex items-center gap-2"
          >
            <Play size={16} />
            Tail
          </button>
          
          {tailMode && (
            <button
              onClick={stopTail}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2"
            >
              <Square size={16} />
              Stop
            </button>
          )}
          
          <button
            onClick={() => {
              setResults([])
              setFacets(null)
              setError(null)
              setSelectedRow(null)
            }}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-100 rounded-lg p-4">
          Error: {error}
        </div>
      )}

      {/* Facets and Timeline */}
      {facets && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Severity Distribution */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-200 mb-4">Severity Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={facets.by_severity}
                  dataKey="c"
                  nameKey="severity"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ severity, c }) => `${severity}: ${c}`}
                >
                  {facets.by_severity.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={['#ef4444', '#f97316', '#eab308', '#6b7280'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Timeline */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-200 mb-4">Event Timeline</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={facets.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="ts" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                <Line type="monotone" dataKey="c" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-gray-800 rounded-lg">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-200">
              Results ({results.length || latest.data?.rows?.length || 0} events)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInspector(!showInspector)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1"
              >
                {showInspector ? <EyeOff size={14} /> : <Eye size={14} />}
                Inspector
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex">
          {/* Virtualized Results List */}
          <div className="flex-1">
            <List
              ref={listRef}
              height={400}
              itemCount={results.length || latest.data?.rows?.length || 0}
              itemSize={60}
              width="100%"
            >
              {Row}
            </List>
          </div>
          
          {/* Row Inspector */}
          {showInspector && selectedRow && (
            <div className="w-96 border-l border-gray-700 p-4 bg-gray-900">
              <h4 className="text-lg font-medium text-gray-200 mb-4">Row Inspector</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Raw JSON</label>
                  <pre className="text-xs bg-gray-800 p-2 rounded overflow-auto max-h-96">
                    {JSON.stringify(selectedRow, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Searches Dialog */}
      {showSavedDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-200 mb-4">Save Search</h3>
            <input
              type="text"
              placeholder="Search name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={saveSearch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Save
              </button>
              <button
                onClick={() => setShowSavedDialog(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


