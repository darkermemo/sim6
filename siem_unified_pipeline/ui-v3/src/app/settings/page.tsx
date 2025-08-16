"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/ActionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, 
  User, 
  Bell, 
  Shield, 
  Database,
  Monitor,
  Key,
  Globe,
  Clock,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";

export default function SettingsPage() {
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    browserNotifications: false,
    slackIntegration: true,
    smsAlerts: false
  });

  const [security, setSecurity] = useState({
    twoFactorAuth: true,
    sessionTimeout: 30,
    passwordExpiry: 90,
    loginAttempts: 5
  });

  const [systemSettings, setSystemSettings] = useState({
    dataRetention: 365,
    logLevel: "INFO",
    autoBackup: true,
    maintenanceMode: false
  });

  const [apiSettings, setApiSettings] = useState({
    rateLimit: 1000,
    timeout: 30,
    retries: 3,
    caching: true
  });

  const handleResetToDefaults = () => {
    setNotifications({
      emailAlerts: true,
      browserNotifications: false,
      slackIntegration: false,
      smsAlerts: false
    });
    setSecurity({
      twoFactorAuth: false,
      sessionTimeout: 30,
      passwordExpiry: 90,
      loginAttempts: 5
    });
    setSystemSettings({
      dataRetention: 365,
      logLevel: "INFO",
      autoBackup: true,
      maintenanceMode: false
    });
    setApiSettings({
      rateLimit: 1000,
      timeout: 30,
      retries: 3,
      caching: true
    });
  };

  const handleSaveChanges = async () => {
    // TODO: Implement API call to save settings
    console.log('Saving settings:', {
      notifications,
      security,
      systemSettings,
      apiSettings
    });
  };

  return (
    <div className="space-y-6">
      {/* Watermark */}
      <div className="fixed bottom-3 right-4 z-50 pointer-events-none select-none  text-xs font-semibold bg-muted text-muted-foreground px-2 py-1 rounded">
        UI-V3 View (Settings)
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure your SIEM platform preferences and system settings
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton 
            variant="outline" 
            className="gap-2"
            data-action="settings:config:reset"
            data-intent="api"
            data-endpoint="/api/v2/settings/reset"
            onClick={handleResetToDefaults}
          >
            <RefreshCw className="h-4 w-4" />
            Reset to Defaults
          </ActionButton>
          <ActionButton 
            className="gap-2"
            data-action="settings:config:save"
            data-intent="api"
            data-endpoint="/api/v2/settings"
            onClick={handleSaveChanges}
          >
            <Save className="h-4 w-4" />
            Save Changes
          </ActionButton>
        </div>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Full Name
              </label>
              <Input defaultValue="Security Admin" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <Input defaultValue="admin@company.com" type="email" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Department
              </label>
              <Input defaultValue="Information Security" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Timezone
              </label>
              <select className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-card text-foreground">
                <option value="UTC">UTC (GMT+0)</option>
                <option value="EST">Eastern Time (GMT-5)</option>
                <option value="PST">Pacific Time (GMT-8)</option>
                <option value="CET">Central European Time (GMT+1)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Email Alerts</h4>
                <p className="text-sm text-muted-foreground">
                  Receive security alerts via email
                </p>
              </div>
              <Switch
                checked={notifications.emailAlerts}
                onCheckedChange={(checked: boolean) => 
                  setNotifications(prev => ({ ...prev, emailAlerts: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Browser Notifications</h4>
                <p className="text-sm text-muted-foreground">
                  Show real-time notifications in browser
                </p>
              </div>
              <Switch
                checked={notifications.browserNotifications}
                onCheckedChange={(checked: boolean) => 
                  setNotifications(prev => ({ ...prev, browserNotifications: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Slack Integration</h4>
                <p className="text-sm text-muted-foreground">
                  Send alerts to Slack channels
                </p>
              </div>
              <Switch
                checked={notifications.slackIntegration}
                onCheckedChange={(checked: boolean) => 
                  setNotifications(prev => ({ ...prev, slackIntegration: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">SMS Alerts</h4>
                <p className="text-sm text-muted-foreground">
                  Critical alerts via SMS
                </p>
              </div>
              <Switch
                checked={notifications.smsAlerts}
                onCheckedChange={(checked: boolean) => 
                  setNotifications(prev => ({ ...prev, smsAlerts: checked }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Two-Factor Authentication</h4>
                  <p className="text-sm text-muted-foreground">
                    Add extra security to your account
                  </p>
                </div>
                <Switch
                  checked={security.twoFactorAuth}
                  onCheckedChange={(checked: boolean) => 
                    setSecurity(prev => ({ ...prev, twoFactorAuth: checked }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Session Timeout (minutes)
                </label>
                <Input
                  type="number"
                  value={security.sessionTimeout}
                  onChange={(e) => 
                    setSecurity(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Password Expiry (days)
                </label>
                <Input
                  type="number"
                  value={security.passwordExpiry}
                  onChange={(e) => 
                    setSecurity(prev => ({ ...prev, passwordExpiry: parseInt(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Max Login Attempts
                </label>
                <Input
                  type="number"
                  value={security.loginAttempts}
                  onChange={(e) => 
                    setSecurity(prev => ({ ...prev, loginAttempts: parseInt(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            System Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Data Retention (days)
                </label>
                <Input
                  type="number"
                  value={systemSettings.dataRetention}
                  onChange={(e) => 
                    setSystemSettings(prev => ({ ...prev, dataRetention: parseInt(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Log Level
                </label>
                <select 
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-card text-foreground"
                  value={systemSettings.logLevel}
                  onChange={(e) => 
                    setSystemSettings(prev => ({ ...prev, logLevel: e.target.value }))
                  }
                >
                  <option value="DEBUG">DEBUG</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Automatic Backup</h4>
                  <p className="text-sm text-muted-foreground">
                    Enable daily system backups
                  </p>
                </div>
                <Switch
                  checked={systemSettings.autoBackup}
                  onCheckedChange={(checked: boolean) => 
                    setSystemSettings(prev => ({ ...prev, autoBackup: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Maintenance Mode</h4>
                  <p className="text-sm text-muted-foreground">
                    Temporarily disable system access
                  </p>
                </div>
                <Switch
                  checked={systemSettings.maintenanceMode}
                  onCheckedChange={(checked: boolean) => 
                    setSystemSettings(prev => ({ ...prev, maintenanceMode: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Rate Limit (requests/hour)
                </label>
                <Input
                  type="number"
                  value={apiSettings.rateLimit}
                  onChange={(e) => 
                    setApiSettings(prev => ({ ...prev, rateLimit: parseInt(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Request Timeout (seconds)
                </label>
                <Input
                  type="number"
                  value={apiSettings.timeout}
                  onChange={(e) => 
                    setApiSettings(prev => ({ ...prev, timeout: parseInt(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Max Retries
                </label>
                <Input
                  type="number"
                  value={apiSettings.retries}
                  onChange={(e) => 
                    setApiSettings(prev => ({ ...prev, retries: parseInt(e.target.value) }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Response Caching</h4>
                  <p className="text-sm text-muted-foreground">
                    Cache API responses for better performance
                  </p>
                </div>
                <Switch
                  checked={apiSettings.caching}
                  onCheckedChange={(checked: boolean) => 
                    setApiSettings(prev => ({ ...prev, caching: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg border border-slate-200 dark:border-slate-700">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100">Database</h4>
                <p className="text-sm text-green-700 dark:text-green-300">Connected</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg border border-slate-200 dark:border-slate-700">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100">API Service</h4>
                <p className="text-sm text-green-700 dark:text-green-300">Running</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              <div>
                <h4 className="font-medium text-yellow-900 dark:text-yellow-100">Search Service</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">Degraded</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}