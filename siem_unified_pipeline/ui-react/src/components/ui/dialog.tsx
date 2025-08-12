import React from 'react'

type DialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  children?: React.ReactNode
}

export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
      <div className="bg-gray-800 rounded-lg p-6 w-96">
        {title && <h3 className="text-lg font-medium text-gray-200 mb-4">{title}</h3>}
        {children}
        <div className="mt-4 text-right">
          <button className="px-3 py-2 bg-gray-700 rounded" onClick={() => onOpenChange(false)}>Close</button>
        </div>
      </div>
    </div>
  )
}


