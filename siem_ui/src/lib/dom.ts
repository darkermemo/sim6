// DOM utility functions for React event handling

/**
 * Utility function to wrap event handlers with stopPropagation
 * Prevents event bubbling while still allowing the original handler to execute
 * 
 * @param fn Optional event handler function to execute after stopping propagation
 * @returns Event handler that stops propagation and optionally calls the provided function
 * 
 * @example
 * // Basic usage - just stop propagation
 * <button onClick={stopPropagation()}>Click me</button>
 * 
 * @example
 * // With custom handler
 * <button onClick={stopPropagation((e) => console.log('Button clicked'))}>Click me</button>
 * 
 * @example
 * // With existing handler
 * const handleClick = (e) => { console.log('clicked'); };
 * <button onClick={stopPropagation(handleClick)}>Click me</button>
 */
export const stopPropagation = 
  <E extends React.SyntheticEvent>(fn?: (e: E) => void) => 
  (e: E) => { 
    e.stopPropagation(); 
    fn?.(e); 
  };