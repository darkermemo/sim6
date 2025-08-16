// ip.ts
export function ipToString(col: string, type?: string) {
  if (!type) return `IPv6NumToString(${col})`;
  if (type.startsWith('IPv4')) return `IPv4NumToString(${col})`;
  if (type.startsWith('IPv6')) return `IPv6NumToString(${col})`;
  return col;
}

export function rewriteIpPredicates(sqlFrag: string, col: string, type?: string) {
  const sCol = ipToString(col, type);
  return sqlFrag
    .replace(new RegExp(`match\\(${col}\\s*,\\s*'`, 'g'), `match(${sCol}, '`) 
    .replace(new RegExp(`${col}\\s+LIKE\\s+'`, 'g'), `${sCol} LIKE '`);
}


