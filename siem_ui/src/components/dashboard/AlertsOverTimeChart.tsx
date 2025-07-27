
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Card } from '@/components/ui/Card';
import type { AlertsOverTimeData } from '@/types/api';

interface AlertsOverTimeChartProps {
  data?: AlertsOverTimeData[];
}

export function AlertsOverTimeChart({ data = [] }: AlertsOverTimeChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, item: any) => sum + item.value, 0);
      
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-primary-text font-medium">{`Time: ${label}`}</p>
          <p className="text-secondary-text text-sm mb-2">{`Total Alerts: ${total}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {`${entry.name}: ${entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card title="Alerts by Severity Over Time" className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="hour" 
            stroke="#94a3b8"
            fontSize={12}
            tickLine={{ stroke: '#374151' }}
          />
          <YAxis 
            stroke="#94a3b8"
            fontSize={12}
            tickLine={{ stroke: '#374151' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: '#94a3b8' }}
          />
          
          {/* Stacked bars with severity colors */}
          <Bar 
            dataKey="critical" 
            stackId="a" 
            fill="#ef4444" 
            name="Critical"
            radius={[0, 0, 0, 0]}
          />
          <Bar 
            dataKey="high" 
            stackId="a" 
            fill="#f97316" 
            name="High"
            radius={[0, 0, 0, 0]}
          />
          <Bar 
            dataKey="medium" 
            stackId="a" 
            fill="#eab308" 
            name="Medium"
            radius={[0, 0, 0, 0]}
          />
          <Bar 
            dataKey="low" 
            stackId="a" 
            fill="#0ea5e9" 
            name="Low"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
} 