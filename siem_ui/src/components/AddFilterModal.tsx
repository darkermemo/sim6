import React, { useState } from 'react';
import { X } from 'lucide-react';
import { EventFilter, FILTER_OPERATORS, COMMON_FIELDS } from '../types/events';

interface AddFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFilter: (filter: EventFilter) => void;
}

export const AddFilterModal: React.FC<AddFilterModalProps> = ({
  isOpen,
  onClose,
  onAddFilter
}) => {
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('=');
  const [value, setValue] = useState('');
  const [customField, setCustomField] = useState('');
  const [useCustomField, setUseCustomField] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedField = useCustomField ? customField : field;
    
    if (!selectedField || !operator || !value) {
      return;
    }

    onAddFilter({
      field: selectedField,
      operator,
      value
    });

    // Reset form
    setField('');
    setOperator('=');
    setValue('');
    setCustomField('');
    setUseCustomField(false);
  };

  const handleClose = () => {
    // Reset form
    setField('');
    setOperator('=');
    setValue('');
    setCustomField('');
    setUseCustomField(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card dark:bg-card rounded-lg shadow-xl w-full max-w-md mx-4 border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-primary-text">Add Filter</h2>
          <button
            onClick={handleClose}
            className="text-secondary-text hover:text-primary-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Field Selection */}
          <div>
            <label className="block text-sm font-medium text-primary-text mb-2">
              Field
            </label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="common-field"
                  name="field-type"
                  checked={!useCustomField}
                  onChange={() => setUseCustomField(false)}
                  className="text-blue-600"
                />
                <label htmlFor="common-field" className="text-sm text-primary-text">
                  Common fields
                </label>
              </div>
              
              {!useCustomField && (
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-background text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a field...</option>
                  {COMMON_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
              
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="custom-field"
                  name="field-type"
                  checked={useCustomField}
                  onChange={() => setUseCustomField(true)}
                  className="text-blue-600"
                />
                <label htmlFor="custom-field" className="text-sm text-primary-text">
                  Custom field
                </label>
              </div>
              
              {useCustomField && (
                <input
                  type="text"
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                  placeholder="Enter field name..."
                  className="w-full px-3 py-2 border border-border bg-background text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              )}
            </div>
          </div>

          {/* Operator Selection */}
          <div>
            <label className="block text-sm font-medium text-primary-text mb-2">
              Operator
            </label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full px-3 py-2 border border-border bg-background text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {FILTER_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value Input */}
          <div>
            <label className="block text-sm font-medium text-primary-text mb-2">
              Value
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value..."
              className="w-full px-3 py-2 border border-border bg-background text-primary-text rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-primary-text bg-background border border-border rounded-md hover:bg-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Filter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};