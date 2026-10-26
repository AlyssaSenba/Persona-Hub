import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ChatEvent,
  ChatSendInput,
  DebugApplyInput,
  DebugPreviewInput,
  DebugProposeInput,
  DebugRevertInput,
  LabApi,
  SettingsSaveInput,
} from '@shared/types';

const api: LabApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SettingsSaveInput) => ipcRenderer.invoke('settings:save', input),
  clearApiKey: () => ipcRenderer.invoke('settings:clear-key'),
  getPersona: () => ipcRenderer.invoke('persona:get'),
  sendChat: (input: ChatSendInput) => ipcRenderer.invoke('chat:send', input),
  cancelChat: (requestId: string) => ipcRenderer.invoke('chat:cancel', requestId),
  onChatEvent: (callback: (event: ChatEvent) => void) => {
    const listener = (_event: IpcRendererEvent, payload: ChatEvent): void => {
      callback(payload);
    };
    ipcRenderer.on('chat:event', listener);
    return () => ipcRenderer.removeListener('chat:event', listener);
  },
  proposePatch: (input: DebugProposeInput) => ipcRenderer.invoke('debug:propose', input),
  previewPatch: (input: DebugPreviewInput) => ipcRenderer.invoke('debug:preview', input),
  applyPatch: (input: DebugApplyInput) => ipcRenderer.invoke('debug:apply', input),
  revertPatch: (input: DebugRevertInput) => ipcRenderer.invoke('debug:revert', input),
  listPatches: () => ipcRenderer.invoke('debug:list'),
  openConfig: () => ipcRenderer.invoke('app:open-config'),
};

contextBridge.exposeInMainWorld('lab', api);
