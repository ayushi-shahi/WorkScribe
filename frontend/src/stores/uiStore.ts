import { create } from 'zustand'

interface UIState {
  // Task panel
  isTaskPanelOpen: boolean
  activePanelTaskId: string | null
  openTaskPanel: (taskId: string) => void
  closeTaskPanel: () => void

  // Command palette
  isCommandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void

  // Notifications panel
  isNotificationsPanelOpen: boolean
  toggleNotificationsPanel: () => void
  closeNotificationsPanel: () => void
}

export const useUIStore = create<UIState>((set) => ({
  // Task panel
  isTaskPanelOpen: false,
  activePanelTaskId: null,
  openTaskPanel: (taskId) => set({ isTaskPanelOpen: true, activePanelTaskId: taskId }),
  closeTaskPanel: () => set({ isTaskPanelOpen: false, activePanelTaskId: null }),

  // Command palette
  isCommandPaletteOpen: false,
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),

  // Notifications panel
  isNotificationsPanelOpen: false,
  toggleNotificationsPanel: () =>
    set((s) => ({ isNotificationsPanelOpen: !s.isNotificationsPanelOpen })),
  closeNotificationsPanel: () => set({ isNotificationsPanelOpen: false }),
}))