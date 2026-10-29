import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ElectronApi } from '@zero/types';

const api: ElectronApi = {
  vault: {
    status: () => ipcRenderer.invoke('vault:status'),
    create: (input) => ipcRenderer.invoke('vault:create', input),
    unlock: (input) => ipcRenderer.invoke('vault:unlock', input),
    resetPin: (input) => ipcRenderer.invoke('vault:resetPin', input),
    lock: () => ipcRenderer.invoke('vault:lock'),
    destroy: () => ipcRenderer.invoke('vault:destroy'),
    setPanicPin: (input) => ipcRenderer.invoke('vault:set-panic-pin', input),
    clearPanicPin: () => ipcRenderer.invoke('vault:clear-panic-pin'),
    setNukeLimit: (limit) => ipcRenderer.invoke('vault:set-nuke-limit', limit),
    panicStatus: () => ipcRenderer.invoke('vault:panic-status'),
    migrationStatus: () => ipcRenderer.invoke('vault:migration-status'),
    migrate: (input) => ipcRenderer.invoke('vault:migrate', input),
    onAutoLocked: (listener) => {
      const handler = (_event: IpcRendererEvent, status: Parameters<typeof listener>[0]): void =>
        listener(status);
      ipcRenderer.on('vault:auto-locked', handler);
      return () => {
        ipcRenderer.removeListener('vault:auto-locked', handler);
      };
    },
  },
  openDomain: (domain) => ipcRenderer.invoke('shell:open-domain', domain),
  clipboard: {
    copy: (value) => ipcRenderer.invoke('clipboard:copy', value),
  },
  entries: {
    list: () => ipcRenderer.invoke('entries:list'),
    save: (entry) => ipcRenderer.invoke('entries:save', entry),
    remove: (id) => ipcRenderer.invoke('entries:delete', id),
  },
  authenticator: {
    list: () => ipcRenderer.invoke('authenticator:list'),
    saveUri: (uri) => ipcRenderer.invoke('authenticator:save-uri', uri),
    save: (token) => ipcRenderer.invoke('authenticator:save', token),
    remove: (id) => ipcRenderer.invoke('authenticator:delete', id),
    codes: () => ipcRenderer.invoke('authenticator:codes'),
  },
  generator: {
    generate: (options) => ipcRenderer.invoke('generator:generate', options),
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
  },
};

contextBridge.exposeInMainWorld('api', api);
