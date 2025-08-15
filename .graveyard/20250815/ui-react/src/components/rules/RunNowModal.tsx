
import { AlertTriangle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineKeyValue } from '@/components/common/InlineKeyValue';

interface RunNowModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ruleId: string;
  ruleName: string;
  watermarkWindow?: {
    from: Date;
    to: Date;
  };
  loading?: boolean;
}

export function RunNowModal({
  open,
  onClose,
  onConfirm,
  ruleId,
  ruleName,
  watermarkWindow,
  loading = false,
}: RunNowModalProps) {
  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Run Rule Now
          </DialogTitle>
          <DialogDescription>
            This will immediately process events for the selected rule
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <InlineKeyValue label="Rule ID" value={ruleId} />
          <InlineKeyValue label="Rule Name" value={ruleName} />
          
          {watermarkWindow && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Processing Window
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    The rule will process events in the following time range:
                  </p>
                </div>
              </div>
              
              <div className="space-y-2 ml-7">
                <InlineKeyValue 
                  label="From (watermark)" 
                  value={formatDateTime(watermarkWindow.from)} 
                />
                <InlineKeyValue 
                  label="To (now - 120s)" 
                  value={formatDateTime(watermarkWindow.to)} 
                />
              </div>
            </div>
          )}
          
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium mb-1">Note:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>This action will generate alerts for matching events</li>
              <li>Duplicate alerts will be prevented by the dedupe mechanism</li>
              <li>The watermark will be updated after successful execution</li>
            </ul>
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>Processing...</>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
