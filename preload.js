const { contextBridge, ipcRenderer } = require('electron');

const validChannels = [
    'archive-updated-external-thumb',
    'translate-text-request',
    'toggle-shortcuts-window',
    'get-shortcuts-config',
    'save-shortcuts-config',
    'active-tab-pass-data-response',
    'pass-db-find-credentials',
    'pass-db-save-credentials',
    'get-all-vault-items',
    'toggle-archive-window',
    'before-input-event',
    'save-to-archive-from-picker',
    'get-archive-items', 
    'request-active-tab-data',   
    'active-tab-data-response', 
    'open-new-tab',               
    'force-open-url',          
    'delete-from-archive',
    'rename-in-archive',
    'change-item-group',
    'get-groups',
    'add-group',
    'rename-group',
    'select-file',       
    'save-config',   
    'app-message', 
    'widget-update', 
    'go-back', 
    'show-context-menu', 
    'window-minimize',    
    'window-maximize',    
    'window-close',
    'fullscreen-toggled',
    'get-proxy-bypass-list',
    'get-current-domain-for-proxy',
    'save-proxy-domain',   
    'delete-proxy-domain',
    'hotkey-action',
    'execute-discord-answer',
    'execute-discord-mute',
    'execute-yandex-play',
    'execute-yandex-next',
    'execute-yandex-prev',
    // Добавлен канал для переводчика:
    'translate-array',
    'local-translate-array'
];

contextBridge.exposeInMainWorld('electronAPI', {
    sendTranslationRequest: (textArray) => ipcRenderer.send('translate-text-request', textArray),
    onTranslationChunk: (callback) => ipcRenderer.on('translate-text-chunk', (e, data) => callback(data)),
    onTranslationFinal: (callback) => ipcRenderer.on('translate-text-final', (e, data) => callback(data)),
    send: (channel, data) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    
    on: (channel, func) => {
        if (validChannels.includes(channel)) {
            const subscription = (_event, ...args) => func(...args);
            
            ipcRenderer.on(channel, subscription);
            
            // Возвращаем функцию отписки, чтобы избежать утечек памяти
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    },
    
    invoke: (channel, data) => {
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    },
    
    showMenu: () => ipcRenderer.invoke('show-context-menu') 
});

contextBridge.exposeInMainWorld('proxyAPI', {
    getBypassList: () => ipcRenderer.invoke('get-proxy-bypass-list'),
    addDomain: (domain) => ipcRenderer.invoke('save-proxy-domain', domain),
    removeDomain: (domain) => ipcRenderer.invoke('delete-proxy-domain', domain)
});