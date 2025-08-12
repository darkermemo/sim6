import React from 'react';
import { Send, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/alerts';
import type { AlertNote } from '@/lib/alerts';

interface NotesProps {
  notes: AlertNote[];
  onAddNote: (body: string) => void;
  loading?: boolean;
}

export function Notes({ notes, onAddNote, loading = false }: NotesProps) {
  const [noteBody, setNoteBody] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddNote(noteBody.trim());
      setNoteBody('');
      // Emit instrumentation event
      if (window.__ux) {
        window.__ux.emit('alerts:notes:add', { ok: true });
      }
    } catch (error) {
      console.error('Failed to add note:', error);
      if (window.__ux) {
        window.__ux.emit('alerts:notes:add', { ok: false });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = 10000 - noteBody.length;

  return (
    <div className="flex flex-col h-full">
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No notes yet. Add the first one below.
          </p>
        ) : (
          notes.map((note, index) => (
            <div
              key={note.note_id || index}
              className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="w-4 h-4" />
                <span>{note.author || 'Unknown'}</span>
                {note.created_at && (
                  <>
                    <span>•</span>
                    <span title={new Date(note.created_at).toLocaleString()}>
                      {formatRelativeTime(note.created_at)}
                    </span>
                  </>
                )}
              </div>
              <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                {note.body}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Note Form */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value.slice(0, 10000))}
            placeholder="Add a note..."
            className="w-full min-h-[80px] p-3 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            disabled={isSubmitting}
            aria-label="Note content"
          />
          <div className="flex items-center justify-between">
            <span className={`text-xs ${remainingChars < 100 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {remainingChars} characters remaining
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!noteBody.trim() || isSubmitting || remainingChars < 0}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-pulse">Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Add window.__ux type declaration
declare global {
  interface Window {
    __ux?: {
      emit: (event: string, data: any) => void;
    };
  }
}
