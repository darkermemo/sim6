import { create } from 'zustand';

interface UiState {
  // Alert drawer state
  alertDrawerOpen: boolean;
  selectedAlertId: string | null;

  // Rule drawer state
  ruleDrawerOpen: boolean;
  selectedRuleId: string | null;

  // Sidebar state
  sidebarOpen: boolean;

  // Actions
  openAlertDrawer: (alertId: string) => void;
  closeAlertDrawer: () => void;
  openRuleDrawer: (ruleId: string) => void;
  closeRuleDrawer: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * UI Store for managing application UI state
 * Uses Zustand for simple state management
 */
export const useUiStore = create<UiState>((set) => ({
  // Initial state
  alertDrawerOpen: false,
  selectedAlertId: null,
  ruleDrawerOpen: false,
  selectedRuleId: null,
  sidebarOpen: false,

  // Actions
  openAlertDrawer: (alertId: string) => {
    set({ alertDrawerOpen: true, selectedAlertId: alertId });
  },

  closeAlertDrawer: () => {
    set({ alertDrawerOpen: false, selectedAlertId: null });
  },

  openRuleDrawer: (ruleId: string) => {
    set({ ruleDrawerOpen: true, selectedRuleId: ruleId });
  },

  closeRuleDrawer: () => {
    set({ ruleDrawerOpen: false, selectedRuleId: null });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
  },
}));