import React from 'react';
import { Upload, X, FileArchive, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatFileSize } from '@/lib/rulePacks';
import { cn } from '@/lib/utils';

interface UploadCardProps {
  onUpload: (file: File, metadata: {
    name?: string;
    version?: string;
    source?: string;
    uploader?: string;
  }) => void;
  onCancel: () => void;
  isUploading: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB

export function UploadCard({ onUpload, onCancel, isUploading }: UploadCardProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [metadata, setMetadata] = React.useState({
    name: '',
    version: '1.0.0',
    source: 'manual',
    uploader: 'admin',
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    
    // Validate file type
    const validTypes = ['application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-gzip'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(zip|tar\.gz|tgz)$/i)) {
      setError('File must be a ZIP or TAR.GZ archive');
      return;
    }
    
    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
      return;
    }
    
    setFile(selectedFile);
    
    // Auto-fill name from filename if empty
    if (!metadata.name) {
      const name = selectedFile.name.replace(/\.(zip|tar\.gz|tgz)$/i, '').replace(/[_-]/g, ' ');
      setMetadata(prev => ({ ...prev, name }));
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleSubmit = () => {
    if (!file) return;
    
    onUpload(file, {
      ...metadata,
      name: metadata.name || file.name,
    });
  };
  
  const isValid = file && metadata.name && metadata.version && !error;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Upload Rule Pack</CardTitle>
            <CardDescription>
              Upload a ZIP or TAR.GZ file containing SIGMA and native rules
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isUploading}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600",
            file && "bg-gray-50 dark:bg-gray-800"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {file ? (
            <div className="space-y-2">
              <FileArchive className="w-12 h-12 mx-auto text-gray-400" />
              <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFile(null)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-12 h-12 mx-auto text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">
                Drag and drop your rule pack here, or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports ZIP and TAR.GZ up to {formatFileSize(MAX_FILE_SIZE)}
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </Button>
            </div>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tar.gz,.tgz"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                handleFileSelect(selectedFile);
              }
            }}
          />
        </div>
        
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {/* Metadata Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pack-name">Pack Name *</Label>
            <Input
              id="pack-name"
              value={metadata.name}
              onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Security Baseline Pack"
              disabled={isUploading}
            />
          </div>
          <div>
            <Label htmlFor="pack-version">Version *</Label>
            <Input
              id="pack-version"
              value={metadata.version}
              onChange={(e) => setMetadata(prev => ({ ...prev, version: e.target.value }))}
              placeholder="e.g., 1.0.0"
              disabled={isUploading}
            />
          </div>
          <div>
            <Label htmlFor="pack-source">Source</Label>
            <Input
              id="pack-source"
              value={metadata.source}
              onChange={(e) => setMetadata(prev => ({ ...prev, source: e.target.value }))}
              placeholder="e.g., manual, github, sigma-hq"
              disabled={isUploading}
            />
          </div>
          <div>
            <Label htmlFor="pack-uploader">Uploader</Label>
            <Input
              id="pack-uploader"
              value={metadata.uploader}
              onChange={(e) => setMetadata(prev => ({ ...prev, uploader: e.target.value }))}
              placeholder="e.g., admin"
              disabled={isUploading}
            />
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isUploading}
          >
            {isUploading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Pack
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
