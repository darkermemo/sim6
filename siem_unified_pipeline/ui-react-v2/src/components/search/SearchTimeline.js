import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
/**
 * Timeline visualization showing event distribution over time
 */
export default function SearchTimeline({ timeline }) {
    const { maxCount, bars } = useMemo(() => {
        const maxCount = Math.max(...timeline.buckets.map(b => b.count), 1);
        const bars = timeline.buckets.map(bucket => ({
            time: new Date(bucket.t * 1000),
            count: bucket.count,
            height: (bucket.count / maxCount) * 100,
        }));
        return { maxCount, bars };
    }, [timeline]);
    return (_jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: {
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "var(--space-xs)",
                    fontSize: "0.75rem",
                    color: "var(--text-tertiary)"
                }, children: [_jsx("span", { children: "Event Timeline" }), _jsxs("span", { children: ["Max: ", maxCount.toLocaleString(), " events"] })] }), _jsx("div", { style: {
                    flex: 1,
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "1px",
                    padding: "var(--space-xs) 0"
                }, children: bars.map((bar, index) => (_jsx("div", { style: {
                        flex: 1,
                        height: `${bar.height}%`,
                        backgroundColor: "var(--color-primary)",
                        borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        position: "relative",
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary-dark)";
                        e.currentTarget.style.transform = "scaleY(1.1)";
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-primary)";
                        e.currentTarget.style.transform = "scaleY(1)";
                    }, title: `${bar.time.toLocaleTimeString()}: ${bar.count.toLocaleString()} events` }, index))) }), _jsxs("div", { style: {
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "var(--text-tertiary)",
                    marginTop: "var(--space-xs)"
                }, children: [_jsx("span", { children: bars[0]?.time.toLocaleTimeString() }), _jsx("span", { children: bars[bars.length - 1]?.time.toLocaleTimeString() })] })] }));
}
