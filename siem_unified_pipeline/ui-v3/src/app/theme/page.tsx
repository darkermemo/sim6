"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/ActionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Palette, 
  Sliders,
  Eye,
  Download,
  Upload,
  RotateCcw,
  Settings,
  Zap,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info
} from "lucide-react";

// Token interface for type safety
interface DesignTokens {
  // Colors (HSL without hsl() wrapper)
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  
  // Sizing (CSS values with units)
  radius: string;
  controlHSm: string;
  controlHMd: string;
  controlHLg: string;
  controlPxSm: string;
  controlPxMd: string;
  controlPxLg: string;
  controlFsSm: string;
  controlFsMd: string;
  controlFsLg: string;
  
  // SIEM Tokens
  sevCritical: string;
  sevHigh: string;
  sevMedium: string;
  sevLow: string;
  statusOk: string;
  statusWarn: string;
  statusBad: string;
}

// Default token values
const defaultTokens: DesignTokens = {
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  primary: "221.2 83.2% 53.3%",
  primaryForeground: "210 40% 98%",
  secondary: "210 40% 96.1%",
  secondaryForeground: "222.2 47.4% 11.2%",
  muted: "210 40% 96.1%",
  mutedForeground: "215.4 16.3% 46.9%",
  accent: "210 40% 96.1%",
  accentForeground: "222.2 47.4% 11.2%",
  destructive: "0 84.2% 60.2%",
  destructiveForeground: "210 40% 98%",
  border: "214.3 31.8% 91.4%",
  input: "214.3 31.8% 91.4%",
  ring: "221.2 83.2% 53.3%",
  
  radius: "0.75rem",
  controlHSm: "2rem",
  controlHMd: "2.25rem",
  controlHLg: "2.5rem",
  controlPxSm: "0.625rem",
  controlPxMd: "0.75rem",
  controlPxLg: "1rem",
  controlFsSm: "0.8125rem",
  controlFsMd: "0.875rem",
  controlFsLg: "0.9375rem",
  
  sevCritical: "0 84% 60%",
  sevHigh: "20 90% 50%",
  sevMedium: "43 90% 45%",
  sevLow: "210 15% 50%",
  statusOk: "142 72% 29%",
  statusWarn: "43 96% 40%",
  statusBad: "0 84% 60%",
};

export default function ThemePage() {
  const [tokens, setTokens] = useState<DesignTokens>(defaultTokens);
  const [presetName, setPresetName] = useState("");

  // Apply tokens to CSS custom properties in real-time
  useEffect(() => {
    const root = document.documentElement;
    
    // Colors
    root.style.setProperty('--background', tokens.background);
    root.style.setProperty('--foreground', tokens.foreground);
    root.style.setProperty('--primary', tokens.primary);
    root.style.setProperty('--primary-foreground', tokens.primaryForeground);
    root.style.setProperty('--secondary', tokens.secondary);
    root.style.setProperty('--secondary-foreground', tokens.secondaryForeground);
    root.style.setProperty('--muted', tokens.muted);
    root.style.setProperty('--muted-foreground', tokens.mutedForeground);
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-foreground', tokens.accentForeground);
    root.style.setProperty('--destructive', tokens.destructive);
    root.style.setProperty('--destructive-foreground', tokens.destructiveForeground);
    root.style.setProperty('--border', tokens.border);
    root.style.setProperty('--input', tokens.input);
    root.style.setProperty('--ring', tokens.ring);
    
    // Sizing
    root.style.setProperty('--radius', tokens.radius);
    root.style.setProperty('--control-h-sm', tokens.controlHSm);
    root.style.setProperty('--control-h-md', tokens.controlHMd);
    root.style.setProperty('--control-h-lg', tokens.controlHLg);
    root.style.setProperty('--control-px-sm', tokens.controlPxSm);
    root.style.setProperty('--control-px-md', tokens.controlPxMd);
    root.style.setProperty('--control-px-lg', tokens.controlPxLg);
    root.style.setProperty('--control-fs-sm', tokens.controlFsSm);
    root.style.setProperty('--control-fs-md', tokens.controlFsMd);
    root.style.setProperty('--control-fs-lg', tokens.controlFsLg);
    
    // SIEM tokens
    root.style.setProperty('--sev-critical', tokens.sevCritical);
    root.style.setProperty('--sev-high', tokens.sevHigh);
    root.style.setProperty('--sev-medium', tokens.sevMedium);
    root.style.setProperty('--sev-low', tokens.sevLow);
    root.style.setProperty('--status-ok', tokens.statusOk);
    root.style.setProperty('--status-warn', tokens.statusWarn);
    root.style.setProperty('--status-bad', tokens.statusBad);
  }, [tokens]);

  const updateToken = (key: keyof DesignTokens, value: string) => {
    setTokens(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setTokens(defaultTokens);
  };

  const exportTokens = () => {
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-${presetName || 'custom'}.json`;
    a.click();
  };

  const importTokens = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          setTokens({ ...defaultTokens, ...imported });
        } catch (error) {
          alert('Invalid theme file');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-full bg-background">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Palette className="h-8 w-8 text-primary" />
            Live Theme Customizer
          </h1>
          <p className="text-muted-foreground mt-1">
            Edit design tokens and see instant changes across the entire application
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Controls Panel */}
          <div className="xl:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Design Token Controls
                </CardTitle>
                <div className="flex gap-2">
                  <ActionButton 
                    size="sm" 
                    variant="outline" 
                    onClick={resetToDefaults}
                    data-action="theme:tokens:reset"
                    data-intent="api"
                    data-endpoint="/api/v2/theme/reset"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </ActionButton>
                  <ActionButton 
                    size="sm" 
                    variant="outline" 
                    onClick={exportTokens}
                    data-action="theme:tokens:export"
                    data-intent="api"
                    data-endpoint="/api/v2/theme/export"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </ActionButton>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".json"
                      onChange={importTokens}
                      className="absolute inset-0  cursor-pointer"
                    />
                    <ActionButton 
                      size="sm" 
                      variant="outline"
                      data-action="theme:tokens:import"
                      data-intent="api"
                      data-endpoint="/api/v2/theme/import"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </ActionButton>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="colors" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="colors">Colors</TabsTrigger>
                    <TabsTrigger value="sizing">Sizing</TabsTrigger>
                    <TabsTrigger value="siem">SIEM</TabsTrigger>
                    <TabsTrigger value="presets">Presets</TabsTrigger>
                  </TabsList>

                  <TabsContent value="colors" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Primary Colors */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Primary Colors</Label>
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="primary">Primary</Label>
                            <Input 
                              id="primary"
                              value={tokens.primary}
                              onChange={(e) => updateToken('primary', e.target.value)}
                              placeholder="221.2 83.2% 53.3%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="background">Background</Label>
                            <Input 
                              id="background"
                              value={tokens.background}
                              onChange={(e) => updateToken('background', e.target.value)}
                              placeholder="0 0% 100%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="foreground">Foreground</Label>
                            <Input 
                              id="foreground"
                              value={tokens.foreground}
                              onChange={(e) => updateToken('foreground', e.target.value)}
                              placeholder="222.2 84% 4.9%"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Secondary Colors */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Secondary Colors</Label>
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="secondary">Secondary</Label>
                            <Input 
                              id="secondary"
                              value={tokens.secondary}
                              onChange={(e) => updateToken('secondary', e.target.value)}
                              placeholder="210 40% 96.1%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="muted">Muted</Label>
                            <Input 
                              id="muted"
                              value={tokens.muted}
                              onChange={(e) => updateToken('muted', e.target.value)}
                              placeholder="210 40% 96.1%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="accent">Accent</Label>
                            <Input 
                              id="accent"
                              value={tokens.accent}
                              onChange={(e) => updateToken('accent', e.target.value)}
                              placeholder="210 40% 96.1%"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="sizing" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Shape */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Shape & Radius</Label>
                        <div>
                          <Label htmlFor="radius">Border Radius</Label>
                          <Input 
                            id="radius"
                            value={tokens.radius}
                            onChange={(e) => updateToken('radius', e.target.value)}
                            placeholder="0.75rem"
                          />
                        </div>
                      </div>

                      {/* Control Sizes */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Control Heights</Label>
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="controlHSm">Small (sm)</Label>
                            <Input 
                              id="controlHSm"
                              value={tokens.controlHSm}
                              onChange={(e) => updateToken('controlHSm', e.target.value)}
                              placeholder="2rem"
                            />
                          </div>
                          <div>
                            <Label htmlFor="controlHMd">Medium (md)</Label>
                            <Input 
                              id="controlHMd"
                              value={tokens.controlHMd}
                              onChange={(e) => updateToken('controlHMd', e.target.value)}
                              placeholder="2.25rem"
                            />
                          </div>
                          <div>
                            <Label htmlFor="controlHLg">Large (lg)</Label>
                            <Input 
                              id="controlHLg"
                              value={tokens.controlHLg}
                              onChange={(e) => updateToken('controlHLg', e.target.value)}
                              placeholder="2.5rem"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="siem" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Severity Colors */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Severity Levels</Label>
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="sevCritical">Critical</Label>
                            <Input 
                              id="sevCritical"
                              value={tokens.sevCritical}
                              onChange={(e) => updateToken('sevCritical', e.target.value)}
                              placeholder="0 84% 60%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="sevHigh">High</Label>
                            <Input 
                              id="sevHigh"
                              value={tokens.sevHigh}
                              onChange={(e) => updateToken('sevHigh', e.target.value)}
                              placeholder="20 90% 50%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="sevMedium">Medium</Label>
                            <Input 
                              id="sevMedium"
                              value={tokens.sevMedium}
                              onChange={(e) => updateToken('sevMedium', e.target.value)}
                              placeholder="43 90% 45%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="sevLow">Low</Label>
                            <Input 
                              id="sevLow"
                              value={tokens.sevLow}
                              onChange={(e) => updateToken('sevLow', e.target.value)}
                              placeholder="210 15% 50%"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status Colors */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Status Indicators</Label>
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor="statusOk">Success/OK</Label>
                            <Input 
                              id="statusOk"
                              value={tokens.statusOk}
                              onChange={(e) => updateToken('statusOk', e.target.value)}
                              placeholder="142 72% 29%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="statusWarn">Warning</Label>
                            <Input 
                              id="statusWarn"
                              value={tokens.statusWarn}
                              onChange={(e) => updateToken('statusWarn', e.target.value)}
                              placeholder="43 96% 40%"
                            />
                          </div>
                          <div>
                            <Label htmlFor="statusBad">Error/Bad</Label>
                            <Input 
                              id="statusBad"
                              value={tokens.statusBad}
                              onChange={(e) => updateToken('statusBad', e.target.value)}
                              placeholder="0 84% 60%"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="presets" className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="presetName">Preset Name</Label>
                        <Input 
                          id="presetName"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="My Custom Theme"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <ActionButton 
                          onClick={() => alert('Preset saved! (In real app, this would save to localStorage)')}
                          data-action="theme:preset:save"
                          data-intent="api"
                          data-endpoint="/api/v2/theme/presets"
                        >
                          Save Current as Preset
                        </ActionButton>
                        <ActionButton 
                          variant="outline" 
                          onClick={() => alert('Load preset functionality would go here')}
                          data-action="theme:preset:load"
                          data-intent="api"
                          data-endpoint="/api/v2/theme/presets"
                        >
                          Load Preset
                        </ActionButton>
                      </div>

                      <Separator />
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Quick Presets</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <ActionButton 
                            variant="outline" 
                            size="sm" 
                            onClick={resetToDefaults}
                            data-action="theme:preset:default-blue"
                            data-intent="api"
                            data-endpoint="/api/v2/theme/preset/default"
                          >
                            Default Blue
                          </ActionButton>
                          <ActionButton 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setTokens({...tokens, primary: "142 76% 36%", ring: "142 76% 36%"})}
                            data-action="theme:preset:green"
                            data-intent="api"
                            data-endpoint="/api/v2/theme/preset/green"
                          >
                            Green Theme
                          </ActionButton>
                          <ActionButton 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setTokens({...tokens, primary: "262 83% 58%", ring: "262 83% 58%"})}
                            data-action="theme:preset:purple"
                            data-intent="api"
                            data-endpoint="/api/v2/theme/preset/purple"
                          >
                            Purple Theme
                          </ActionButton>
                          <ActionButton 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setTokens({...tokens, radius: "0.25rem"})}
                            data-action="theme:preset:sharp"
                            data-intent="api"
                            data-endpoint="/api/v2/theme/preset/sharp"
                          >
                            Sharp Corners
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Live Preview Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Buttons */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Buttons</Label>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton 
                      size="sm"
                      disabled
                      data-action="theme:demo:button-small"
                    >
                      Small
                    </ActionButton>
                    <ActionButton 
                      size="md"
                      disabled
                      data-action="theme:demo:button-medium"

                    >
                      Medium
                    </ActionButton>
                    <ActionButton 
                      size="lg"
                      disabled
                      data-action="theme:demo:button-large"

                    >
                      Large
                    </ActionButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton 
                      variant="secondary"
                      disabled
                      data-action="theme:demo:button-secondary"

                    >
                      Secondary
                    </ActionButton>
                    <ActionButton 
                      variant="outline"
                      disabled
                      data-action="theme:demo:button-outline"

                    >
                      Outline
                    </ActionButton>
                    <ActionButton 
                      variant="destructive"
                      disabled
                      data-action="theme:demo:button-destructive"

                    >
                      Destructive
                    </ActionButton>
                  </div>
                </div>

                <Separator />

                {/* Inputs */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Form Controls</Label>
                  <Input placeholder="Input field" />
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="option1">Option 1</SelectItem>
                      <SelectItem value="option2">Option 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* SIEM Elements */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">SIEM Elements</Label>
                  <div className="flex flex-wrap gap-2">
                    <span className="severity" data-level="critical">Critical</span>
                    <span className="severity" data-level="high">High</span>
                    <span className="severity" data-level="medium">Medium</span>
                    <span className="severity" data-level="low">Low</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 status-ok" />
                      <span className="text-sm">OK</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 status-warn" />
                      <span className="text-sm">Warning</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 status-bad" />
                      <span className="text-sm">Error</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Cards */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Cards</Label>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Sample Card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        This card updates with your theme changes.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Token Values Display */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Current Token Values</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs font-mono">
                  <div>--radius: {tokens.radius}</div>
                  <div>--primary: {tokens.primary}</div>
                  <div>--control-h-md: {tokens.controlHMd}</div>
                  <div className="text-muted-foreground">+ {Object.keys(tokens).length - 3} more...</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* UI-V3 Watermark */}
        <div
          data-testid="ui-v3-watermark"
          aria-hidden="true"
          className="fixed bottom-3 right-4 z-[9999] pointer-events-none select-none text-[11px] font-semibold px-2 py-1 rounded border border-black bg-black text-white shadow-md dark:bg-white dark:text-black"
          title="/theme"
        >
          UI-V3 View (Theme Customizer) • /theme
        </div>
      </div>
    </div>
  );
}
