import React from 'react'

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
}

export function Select({ label, className = '', children, ...props }: SelectProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>}
      <select className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white ${className}`} {...props}>
        {children}
      </select>
    </div>
  )
}


