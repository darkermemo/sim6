import React from 'react';

export default function Diag() {
  const [health, setHealth] = React.useState<'OK' | 'FAIL' | '...'>('...');
  
  React.useEffect(() => {
    fetch(`${(import.meta as any).env.VITE_API_URL || 'http://127.0.0.1:9999'}/api/v2/health`)
      .then(r => r.ok ? setHealth('OK') : setHealth('FAIL'))
      .catch(() => setHealth('FAIL'));
  }, []);
  
  return (
    <pre>
{JSON.stringify({
  PROD: import.meta.env.PROD,
  DEV: import.meta.env.DEV,
  BASE_URL: import.meta.env.BASE_URL,
  LOCATION: window.location.href,
  API_URL: (import.meta as any).env.VITE_API_URL
}, null, 2)}
{"\n"}API Health: {health}
    </pre>
  );
}