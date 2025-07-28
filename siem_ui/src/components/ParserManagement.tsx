import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Plus, Search, Trash2, Code } from 'lucide-react';
import {
  ParserResponse,
  CreateParserRequest,
  ParserListResponse,
} from '@/types/api';

interface ParserManagementProps {
  userRole: string;
}

const ParserManagement: React.FC<ParserManagementProps> = ({ userRole }) => {
  const [parsers, setParsers] = useState<ParserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [selectedParser, setSelectedParser] = useState<ParserResponse | null>(null);
  const [formData, setFormData] = useState({
    parser_name: '',
    parser_type: 'Grok' as 'Grok' | 'Regex',
    pattern: '',
  });

  // Check if user has Admin role
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  useEffect(() => {
    if (isAdmin) {
      fetchParsers();
    } else {
      setError('Access denied. Admin role required.');
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchParsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/parsers', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch parsers');
      }

      const data: ParserListResponse = await response.json();
      setParsers(data.parsers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateParser = async () => {
    try {
      const token = localStorage.getItem('token');
      const createRequest: CreateParserRequest = {
        parser_name: formData.parser_name,
        parser_type: formData.parser_type,
        pattern: formData.pattern,
      };

      const response = await fetch('/api/v1/parsers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest),
      });

      if (!response.ok) {
        throw new Error('Failed to create parser');
      }

      setIsCreateSheetOpen(false);
      setFormData({ parser_name: '', parser_type: 'Grok', pattern: '' });
      fetchParsers();
    } catch (err) {
      setError('Failed to create parser');
    }
  };

  const handleDeleteParser = async (parserId: string) => {
    if (!confirm('Are you sure you want to delete this parser?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/v1/parsers/${parserId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete parser');
      }

      fetchParsers();
    } catch (err) {
      setError('Failed to delete parser');
    }
  };

  const openViewSheet = (parser: ParserResponse) => {
    setSelectedParser(parser);
    setIsViewSheetOpen(true);
  };

  const filteredParsers = parsers.filter(parser =>
    parser.parser_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parser.parser_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          Access denied. Admin role required to manage parsers.
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading parsers...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">{error}</div>
        <div className="text-center mt-4">
          <Button onClick={fetchParsers}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parser Management</h1>
          <p className="text-muted-foreground">
            Manage custom Grok and Regex parsers for log processing
          </p>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Parser
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <label htmlFor="parser-search" className="sr-only">Search parsers</label>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="parser-search"
            type="text"
            placeholder="Search parsers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Parsers List */}
      <Card className="p-6">
        <div className="space-y-4">
          {filteredParsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No parsers found
            </div>
          ) : (
            filteredParsers.map((parser) => (
              <div key={parser.parser_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-medium">{parser.parser_name}</h3>
                    <Badge variant={parser.parser_type === 'Grok' ? 'default' : 'secondary'}>
                      {parser.parser_type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Created: {new Date(parser.created_at * 1000).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Last Updated: {new Date(parser.updated_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openViewSheet(parser)}
                  >
                    <Code className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteParser(parser.parser_id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Create Parser Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Create New Parser</SheetTitle>
            <SheetDescription>
              Create a new custom parser for log processing
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="parser-name" className="block text-sm font-medium mb-2">Parser Name</label>
              <input
                id="parser-name"
                type="text"
                value={formData.parser_name}
                onChange={(e) => setFormData({ ...formData, parser_name: e.target.value })}
                placeholder="Enter parser name"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="parser-type" className="block text-sm font-medium mb-2">Parser Type</label>
              <select
                id="parser-type"
                value={formData.parser_type}
                onChange={(e) => setFormData({ ...formData, parser_type: e.target.value as 'Grok' | 'Regex' })}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Grok">Grok</option>
                <option value="Regex">Regex</option>
              </select>
            </div>
            <div>
              <label htmlFor="parser-pattern" className="block text-sm font-medium mb-2">Pattern</label>
              <textarea
                id="parser-pattern"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                placeholder={formData.parser_type === 'Grok' ? 'Enter Grok pattern (e.g., %{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level})' : 'Enter Regex pattern'}
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateParser}>
                Create
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* View Parser Sheet */}
      <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Parser Details</SheetTitle>
            <SheetDescription>
              View parser configuration and pattern
            </SheetDescription>
          </SheetHeader>
          {selectedParser && (
            <div className="space-y-4 mt-6">
              <div>
                <label htmlFor="parser-name-display" className="block text-sm font-medium mb-2">Parser Name</label>
                <div id="parser-name-display" className="px-3 py-2 bg-gray-50 border border-border rounded-md">
                  {selectedParser.parser_name}
                </div>
              </div>
              <div>
                <label htmlFor="parser-type-display" className="block text-sm font-medium mb-2">Parser Type</label>
                <div id="parser-type-display" className="px-3 py-2 bg-gray-50 border border-border rounded-md">
                  <Badge variant={selectedParser.parser_type === 'Grok' ? 'default' : 'secondary'}>
                    {selectedParser.parser_type}
                  </Badge>
                </div>
              </div>
              <div>
                <label htmlFor="parser-pattern-display" className="block text-sm font-medium mb-2">Pattern</label>
                <div id="parser-pattern-display" className="px-3 py-2 bg-gray-50 border border-border rounded-md font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {selectedParser.pattern}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="parser-created-display" className="block text-sm font-medium mb-2">Created At</label>
                  <div id="parser-created-display" className="px-3 py-2 bg-gray-50 border border-border rounded-md text-sm">
                    {new Date(selectedParser.created_at * 1000).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label htmlFor="parser-updated-display" className="block text-sm font-medium mb-2">Updated At</label>
                  <div id="parser-updated-display" className="px-3 py-2 bg-gray-50 border border-border rounded-md text-sm">
                    {new Date(selectedParser.updated_at * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={() => setIsViewSheetOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ParserManagement;