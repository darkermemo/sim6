import { useMemo } from "react";
import * as Types from "@/lib/api-types";

interface Props {
  timeline: Types.SearchTimelineResponse;
}

/**
 * Timeline visualization showing event distribution over time
 */
export default function SearchTimeline({ timeline }: Props) {
  const { maxCount, bars } = useMemo(() => {
    const maxCount = Math.max(...timeline.buckets.map(b => b.count), 1);
    
    const bars = timeline.buckets.map(bucket => ({
      time: new Date(bucket.t * 1000),
      count: bucket.count,
      height: (bucket.count / maxCount) * 100,
    }));
    
    return { maxCount, bars };
  }, [timeline]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginBottom: "var(--space-xs)",
        fontSize: "0.75rem",
        color: "var(--text-tertiary)"
      }}>
        <span>Event Timeline</span>
        <span>Max: {maxCount.toLocaleString()} events</span>
      </div>
      
      <div style={{ 
        flex: 1, 
        display: "flex", 
        alignItems: "flex-end",
        gap: "1px",
        padding: "var(--space-xs) 0"
      }}>
        {bars.map((bar, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              height: `${bar.height}%`,
              backgroundColor: "var(--color-primary)",
              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary-dark)";
              e.currentTarget.style.transform = "scaleY(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-primary)";
              e.currentTarget.style.transform = "scaleY(1)";
            }}
            title={`${bar.time.toLocaleTimeString()}: ${bar.count.toLocaleString()} events`}
          />
        ))}
      </div>
      
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "0.75rem",
        color: "var(--text-tertiary)",
        marginTop: "var(--space-xs)"
      }}>
        <span>{bars[0]?.time.toLocaleTimeString()}</span>
        <span>{bars[bars.length - 1]?.time.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
