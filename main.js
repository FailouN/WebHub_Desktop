// main.js
const { app, BrowserWindow, globalShortcut, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Подключение внешних изолированных модулей
const { setupBlocker, disableBlocker } = require('./adblocker');
const { setupScreenShare } = require('./screen-share');
const { setupProxyService } = require('./proxy-service');
const { setupArchiveService } = require('./archive-service');
const { setupWindowService } = require('./window-service');
const { setupVaultService } = require('./vault-service');
const { setupPasswordService } = require('./password-service');
const { setupShortcutService } = require('./shortcut-service');

let isAdBlockEnabled = true;
let vaultService = null; 

// 1. ПОДКЛЮЧЕНИЕ ОБНОВЛЕНИЙ И ЛОГОВ
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Определение путей приложения
const userDataPath = path.join(app.getPath('appData'), 'WebHub-Desktop-profile');
const gpuSettingsPath = path.join(userDataPath, 'gpu-settings.json');

if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}
// Переопределяем userData путь на наш кастомный профиль
app.setPath('userData', userDataPath);

// ТЕПЕРЬ МОЖНО БЕЗОПАСНО ИНИЦИАЛИЗИРОВАТЬ СЕРВИС ПАРОЛЕЙ
vaultService = setupVaultService(userDataPath);
setupPasswordService(userDataPath, vaultService);

function isGpuEnabled() {
    try {
        if (fs.existsSync(gpuSettingsPath)) {
            const data = JSON.parse(fs.readFileSync(gpuSettingsPath, 'utf8'));
            return data.enabled !== false;
        }
    } catch (e) { console.error(e); }
    return true; 
}

const gpuActive = isGpuEnabled(); 

if (!gpuActive) {
    app.disableHardwareAcceleration();
    console.log("GPU Acceleration: DISABLED");
} else {
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    console.log("GPU Acceleration: ENABLED");
}

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Инициализация остальных сервисов (кроме shortcutService, он пойдет в ready)
const windowService = setupWindowService(userDataPath);
const proxyService = setupProxyService(userDataPath, createApplicationMenu);
const archiveService = setupArchiveService(userDataPath);

const AGENTS = {
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 WebHubSecureSrv_v3",
    mobile: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36 WebHubSecureSrv_v3",
    IosMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 WebHubSecureSrv_v3"
};

function setUserAgent(type) {
    const newUA = AGENTS[type];
    if (!newUA) return;
    session.defaultSession.setUserAgent(newUA);
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.webContents.isLoading()) w.webContents.reload();
    });
}

function createApplicationMenu() {
    const savedDomains = proxyService.getSavedProxyDomains();
    const template = [
        {
            label: 'Аккаунты',
            submenu: [
                { 
                    label: '🔑 Менеджер паролей', 
                    accelerator: 'CmdOrCtrl+P', 
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) {
                            ipcMain.emit('toggle-password-window', { sender: browserWindow.webContents });
                        }
                    }
                },
                { type: 'separator' }, 
                { label: 'Импортировать профиль (JSON)', accelerator: 'CmdOrCtrl+I', click: () => windowService.handleCookieImport() },
                { label: 'Удалить все куки', click: () => windowService.handleClearCookies() },
                { label: 'Проверить наличие обновлений', click: () => autoUpdater.checkForUpdatesAndNotify() },
                { type: 'separator' },
                { role: 'reload', label: 'Перезагрузить страницу' },
                { role: 'quit', label: 'Выход' }
            ]
        },
        {
            label: 'Прокси',
            submenu: [
                { label: 'Добавить текущий сайт в исключения', click: () => {
                    const win = BrowserWindow.getFocusedWindow();
                    if (win) win.webContents.send('get-current-domain-for-proxy');
                }},
                {
                    label: 'Удалить из исключений',
                    enabled: savedDomains.length > 0, 
                    submenu: savedDomains.map(domain => ({
                        label: domain,
                        click: () => proxyService.removeProxyDomain(domain)
                    }))
                },
                { type: 'separator' },
                { label: 'Очистить весь список', click: () => {
                    const pPath = path.join(userDataPath, 'proxy_bypass.json');
                    if (fs.existsSync(pPath)) {
                        fs.unlinkSync(pPath);
                        proxyService.applyProxySettings();
                        createApplicationMenu();
                        dialog.showMessageBox({ message: "Список исключений очищен" });
                    }
                }}
            ]
        },
        {
            label: 'Система',
            submenu: [
                {
                    label: '⌨️ Горячие клавиши',
                    accelerator: 'CmdOrCtrl+K',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) {
                            ipcMain.emit('toggle-shortcuts-window', { sender: browserWindow.webContents });
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Режим отображения',
                    submenu: [
                        { label: 'Компьютер (Desktop)', click: () => setUserAgent('desktop') },
                        { label: 'Телефон (Mobile)', click: () => setUserAgent('mobile') },
                        { label: 'Ios (Mobile)', click: () => setUserAgent('IosMobile') }
                    ]
                },
                {
                    label: 'Блокировщик рекламы',
                    type: 'checkbox',
                    checked: isAdBlockEnabled,
                    click: async () => {
                        isAdBlockEnabled = !isAdBlockEnabled;
                        if (isAdBlockEnabled) await setupBlocker(session.defaultSession);
                        else {
                            await disableBlocker(session.defaultSession);
                            await session.defaultSession.clearStorageData({ storages: ['cachestorage', 'shadercache'] });
                        }
                        createApplicationMenu();
                        BrowserWindow.getAllWindows().forEach(w => w.reload());
                    }
                },
                {
                    label: 'Аппаратное ускорение',
                    type: 'checkbox',
                    checked: gpuActive,
                    click: () => {
                        const newState = !gpuActive;
                        fs.writeFileSync(gpuSettingsPath, JSON.stringify({ enabled: newState }));
                        dialog.showMessageBox({
                            type: 'info',
                            buttons: ['Перезагрузить', 'Позже'],
                            title: 'Настройка GPU',
                            message: `Для ${newState ? 'включения' : 'выключения'} ускорения нужна перезагрузка.`
                        }).then(({ response }) => {
                            if (response === 0) { app.relaunch(); app.exit(); }
                        });
                    }
                },
                { role: 'toggleDevTools', label: 'Консоль разработчика' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Сбросить масштаб' },
                { role: 'zoomin', label: 'Увеличить' },
                { role: 'zoomout', label: 'Уменьшить' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Обработчики обновлений
autoUpdater.on('update-available', () => { dialog.showMessageBox({ type: 'info', title: 'Обновление', message: 'Найдена новая версия. Загружаю в фоне...', buttons: ['Ок'] }); });
autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({ type: 'question', buttons: ['Установить и перезапустить', 'Позже'], defaultId: 0, title: 'Обновление готово', message: 'Новая версия скачана. Перезагрузить программу для установки?' }).then(result => {
        if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

async function createWindow() {
    const win = new BrowserWindow({
        width: 1600,
        height: 900,
        frame: false, 
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        resizable: true, 
        autoHideMenuBar: true,
        webPreferences: {
            webrtcIPHandlingPolicy: 'disable_non_proxied_udp',
            autoplayPolicy: 'no-user-gesture-required',
            touchEvents: true,
            webviewTag: true,
            webSecurity: true,
            allowRunningInsecureContent: true,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false
        }
    });

    win.webContents.session.setPermissionCheckHandler(() => true);
    win.webContents.session.setPermissionRequestHandler((w, p, callback) => callback(true));

    win.webContents.on('enter-html-full-screen', () => { win.setFullScreen(true); win.webContents.send('fullscreen-toggled', true); });
    win.webContents.on('leave-html-full-screen', () => { win.setFullScreen(false); win.webContents.send('fullscreen-toggled', false); });
    
    // Перехват сообщений от webview для работы менеджера паролей
    win.webContents.on('did-attach-webview', (event, webContents) => {
        webContents.on('console-message', (e) => {
            const message = e.message;

            if (!message.startsWith('WEBVIEW_ACTION:')) return;

            if (message.startsWith('WEBVIEW_ACTION:GET_CREDS:')) {
                const hostname = message.replace('WEBVIEW_ACTION:GET_CREDS:', '').trim();
                
                const accounts = vaultService.findCredentials(hostname);
                if (accounts) {
                    const accountsJson = JSON.stringify(accounts).replace(/'/g, "\\'");
                    
                    const fillScript = `
                        window.postMessage({
                            type: 'VAULT_FILL_DATA',
                            accounts: JSON.parse('${accountsJson}')
                        }, '*');
                    `;
                    webContents.executeJavaScript(fillScript).catch(err => console.error("Ошибка передачи аккаунтов:", err));
                }
            }

            if (message.startsWith('WEBVIEW_ACTION:SAVE_CREDS:')) {
                const rawData = message.replace('WEBVIEW_ACTION:SAVE_CREDS:', '').trim();
                const [url, username, password] = rawData.split('|||');
                
                if (url && username && password) {
                    vaultService.saveCredentials(url, username, password);
                }
            }
        });
    });

    win.webContents.once('dom-ready', () => {
        const ses = win.webContents.session;
        if (win.webContents.getURL() === 'about:blank') return;
        if (isAdBlockEnabled) setupBlocker(ses);
        setupScreenShare(ses);
    });

    setUserAgent('desktop');
    await proxyService.applyProxySettings();
    win.loadFile('index.html');
}

app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy) {
        event.preventDefault();
        callback('ЛОГИН', 'ПАРОЛЬ'); 
    }
});

// Функция вещания команд на вкладки
function broadcast(channel, data = null) {
    BrowserWindow.getAllWindows().forEach(win => {
        try {
            if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
                const url = win.webContents.getURL();
                if (url && url !== 'about:blank' && !url.startsWith('devtools://')) {
                    win.webContents.send(channel, data);
                }
            }
        } catch (e) { console.error(`Ошибка трансляции: ${e.message}`); }
    });
}

// Готовность приложения
app.whenReady().then(async () => {
    setupShortcutService(userDataPath, broadcast, archiveService);

    await proxyService.applyProxySettings();
    createApplicationMenu();
    await createWindow();

    ipcMain.on('open-new-tab', (event, url) => {
        const mainWin = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html') && !w.isDestroyed());
        if (mainWin) mainWin.webContents.send('force-open-url', url);
    });

    // Полноэкранный режим
    globalShortcut.register('F11', () => {
        const focusedWin = BrowserWindow.getFocusedWindow();
        if (focusedWin) {
            const state = !focusedWin.isFullScreen();
            focusedWin.setFullScreen(state);
            focusedWin.setMenuBarVisibility(false);
            focusedWin.webContents.send('fullscreen-toggled', state);
        }
    });

    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 3000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); }); 
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// Безопасный проброс ответа обратно в окно менеджера паролей через прямую отправку
ipcMain.on('active-tab-pass-data-response', (event, data) => {
    const wins = BrowserWindow.getAllWindows();
    const passWin = wins.find(w => !w.isDestroyed() && w.webContents.getURL().includes('password-manager.html'));
    if (passWin) {
        passWin.webContents.send('active-tab-pass-data', data);
    }
});