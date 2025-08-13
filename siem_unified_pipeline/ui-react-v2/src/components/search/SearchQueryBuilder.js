import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
/**
 * Advanced query builder with autocomplete, syntax highlighting, and time range picker
 */
export default function SearchQueryBuilder({ query, timeRange, fields, enums, grammar, onQueryChange, onTimeRangeChange, onSearch, isLoading, }) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState(0);
    const [cursorPosition, setCursorPosition] = useState(0);
    const inputRef = useRef(null);
    // Time range presets
    const timePresets = [
        { label: "Last 5 minutes", value: 300 },
        { label: "Last 15 minutes", value: 900 },
        { label: "Last 1 hour", value: 3600 },
        { label: "Last 6 hours", value: 21600 },
        { label: "Last 24 hours", value: 86400 },
        { label: "Last 7 days", value: 604800 },
    ];
    // Handle query input
    const handleQueryInput = async (e) => {
        const newQuery = e.target.value;
        const cursor = e.target.selectionStart || 0;
        onQueryChange(newQuery);
        setCursorPosition(cursor);
        // Get suggestions based on current position
        const suggestions = await getSuggestions(newQuery, cursor);
        setSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
        setSelectedSuggestion(0);
    };
    // Get suggestions based on query and cursor position
    const getSuggestions = async (query, cursor) => {
        // Find the current token
        const beforeCursor = query.substring(0, cursor);
        const tokens = beforeCursor.split(/\s+/);
        const currentToken = tokens[tokens.length - 1] || "";
        // Field suggestions
        if (currentToken.includes(":")) {
            const [field, valuePrefix] = currentToken.split(":");
            if (enums[field]) {
                return enums[field]
                    .filter(v => v.toLowerCase().startsWith(valuePrefix.toLowerCase()))
                    .map(v => `${field}:${v}`);
            }
        }
        else {
            // Suggest fields
            return fields
                .filter(f => f.searchable && f.name.toLowerCase().startsWith(currentToken.toLowerCase()))
                .map(f => f.name + ":");
        }
        return [];
    };
    // Handle keyboard navigation
    const handleKeyDown = (e) => {
        if (!showSuggestions) {
            if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
            }
            return;
        }
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedSuggestion(prev => Math.max(prev - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (suggestions[selectedSuggestion]) {
                    applySuggestion(suggestions[selectedSuggestion]);
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                break;
        }
    };
    // Apply selected suggestion
    const applySuggestion = (suggestion) => {
        const beforeCursor = query.substring(0, cursorPosition);
        const afterCursor = query.substring(cursorPosition);
        const tokens = beforeCursor.split(/\s+/);
        tokens[tokens.length - 1] = suggestion;
        const newQuery = tokens.join(" ") + afterCursor;
        onQueryChange(newQuery);
        setShowSuggestions(false);
        // Focus and set cursor position
        setTimeout(() => {
            if (inputRef.current) {
                const newPos = tokens.join(" ").length;
                inputRef.current.focus();
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }, children: [_jsxs("select", { value: 'last_seconds' in timeRange ? timeRange.last_seconds : 'custom', onChange: (e) => {
                            const value = e.target.value;
                            if (value === 'custom') {
                                // Show custom time picker
                            }
                            else {
                                onTimeRangeChange({ last_seconds: parseInt(value) });
                            }
                        }, style: { minWidth: "200px" }, children: [timePresets.map(preset => (_jsx("option", { value: preset.value, children: preset.label }, preset.value))), _jsx("option", { value: "custom", children: "Custom range..." })] }), 'from' in timeRange && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "var(--space-sm)" }, children: [_jsx("input", { type: "datetime-local", value: new Date(timeRange.from * 1000).toISOString().slice(0, 16), onChange: (e) => {
                                    const from = Math.floor(new Date(e.target.value).getTime() / 1000);
                                    onTimeRangeChange({ ...timeRange, from });
                                } }), _jsx("span", { children: "to" }), _jsx("input", { type: "datetime-local", value: new Date(timeRange.to * 1000).toISOString().slice(0, 16), onChange: (e) => {
                                    const to = Math.floor(new Date(e.target.value).getTime() / 1000);
                                    onTimeRangeChange({ ...timeRange, to });
                                } })] }))] }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("input", { ref: inputRef, type: "text", value: query, onChange: handleQueryInput, onKeyDown: handleKeyDown, onBlur: () => setTimeout(() => setShowSuggestions(false), 200), placeholder: "Search events... (e.g., severity:high AND event_type:login)", disabled: isLoading, style: {
                            width: "100%",
                            padding: "var(--space-md)",
                            fontSize: "1rem",
                            fontFamily: "var(--font-mono)",
                        } }), showSuggestions && suggestions.length > 0 && (_jsx("div", { style: {
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            backgroundColor: "var(--bg-primary)",
                            border: "1px solid var(--border-color)",
                            borderTop: "none",
                            borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                            boxShadow: "var(--shadow-lg)",
                            maxHeight: "200px",
                            overflow: "auto",
                            zIndex: 1000,
                        }, children: suggestions.map((suggestion, index) => (_jsx("div", { onClick: () => applySuggestion(suggestion), style: {
                                padding: "var(--space-sm) var(--space-md)",
                                cursor: "pointer",
                                backgroundColor: index === selectedSuggestion ? "var(--bg-secondary)" : "transparent",
                                transition: "background-color 0.1s",
                            }, onMouseEnter: () => setSelectedSuggestion(index), children: _jsx("code", { children: suggestion }) }, suggestion))) }))] }), grammar && (_jsxs("div", { style: {
                    marginTop: "var(--space-sm)",
                    fontSize: "0.75rem",
                    color: "var(--text-tertiary)"
                }, children: [_jsx("strong", { children: "Operators:" }), " ", grammar.operators.join(", "), " |", _jsx("strong", { children: " Keywords:" }), " ", grammar.keywords.join(", "), " |", _jsx("strong", { children: " Functions:" }), " ", grammar.functions.slice(0, 3).join(", "), "..."] }))] }));
}
