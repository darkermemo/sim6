/**
 * Utility to convert snake_case keys to camelCase recursively
 */

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${P1}${Capitalize<CamelCase<`${P2}${P3}`>>}`
  : S;

type CamelCaseKeys<T> = {
  [K in keyof T as CamelCase<string & K>]: T[K] extends Record<string, any>
    ? CamelCaseKeys<T[K]>
    : T[K] extends (infer U)[]
    ? U extends Record<string, any>
      ? CamelCaseKeys<U>[]
      : T[K]
    : T[K];
};

/**
 * Convert snake_case keys to camelCase recursively
 */
export function camelcaseKeys<T extends Record<string, any>>(
  obj: T
): CamelCaseKeys<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as CamelCaseKeys<T>;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => camelcaseKeys(item)) as CamelCaseKeys<T>;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        result[camelKey] = value.map((item) => 
          item !== null && typeof item === 'object' ? camelcaseKeys(item) : item
        );
      } else {
        result[camelKey] = camelcaseKeys(value);
      }
    } else {
      result[camelKey] = value;
    }
  }

  return result as CamelCaseKeys<T>;
}

/**
 * Convert camelCase keys to snake_case recursively
 */
export function snakecaseKeys<T extends Record<string, any>>(
  obj: T
): Record<string, any> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => snakecaseKeys(item));
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        result[snakeKey] = value.map((item) => 
          item !== null && typeof item === 'object' ? snakecaseKeys(item) : item
        );
      } else {
        result[snakeKey] = snakecaseKeys(value);
      }
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}