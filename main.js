// main.js
const { app, BrowserWindow, globalShortcut, ipcMain, session, Menu, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Вспомогательная функция для извлечения ссылок или путей к файлам из аргументов
function getFileOrUrl(argv) {
    // Ищем аргумент, который начинается с http/https или заканчивается на html, htm, pdf
    const arg = argv.find(a => a.startsWith('http://') || a.startsWith('https://') || /\.(html|htm|pdf)$/i.test(a));
    if (!arg) return null;

    // Если это не веб-ссылка, значит это локальный путь к файлу. Превращаем его в file:// URL
    if (!arg.startsWith('http://') && !arg.startsWith('https://')) {
        try {
            return require('url').pathToFileURL(path.resolve(arg)).href;
        } catch (e) {
            console.error('[Main]: Ошибка конвертации пути в URL:', e);
            return arg;
        }
    }
    return arg;
}

// =================================================================
// 1. НАСТРОЙКА ПУТЕЙ (Делаем в первую очередь!)
// =================================================================
const userDataPath = path.join(app.getPath('appData'), 'WebHub-Desktop-profile');
const gpuSettingsPath = path.join(userDataPath, 'gpu-settings.json');

if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}
// Переопределяем userData путь ДО проверки синглтона
app.setPath('userData', userDataPath);


// =================================================================
// 2. ФИКС ДЛЯ ОТКРЫТИЯ НОВЫХ ОКОН (С учетом безопасности)
// =================================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return; 
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[Main]: Повторный вызов приложения.');
        
        // ИЗМЕНЕНО: Ищем среди аргументов и веб-ссылки, и локальные файлы (.html/.pdf)
        const fileOrUrl = getFileOrUrl(commandLine);
        
        if (app.isReady()) {
            const wins = BrowserWindow.getAllWindows();
            const mainWin = wins.find(w => w.webContents.getURL().includes('index.html') && !w.isDestroyed());
            
            if (mainWin) {
                // Если главное окно есть, фокусимся на нем
                if (mainWin.isMinimized()) mainWin.restore();
                mainWin.focus();
                
                if (fileOrUrl) {
                    // Передаем ссылку или file:// путь во вкладку существующего окна
                    console.log(`[Main]: Перенаправляю во вкладку: ${fileOrUrl}`);
                    mainWin.webContents.send('force-open-url', fileOrUrl);
                } else {
                    // Если ничего не передано, просто открываем новое окно
                    createWindow();
                }
            } else {
                createWindow();
            }
        }
    });
}

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

// Динамически определяем пути для сборки и девелопмента
const basePath = app.isPackaged ? process.resourcesPath : __dirname;
const pythonExecutable = path.join(basePath, 'python-env', 'python.exe');
const enginePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'translator-engine.py') 
    : path.join(__dirname, 'translator-engine.py');

console.log(`[Main Debug Paths]:
  -> Python EXE: ${pythonExecutable}
  -> Engine Script: ${enginePath}
  -> Is Packaged?: ${app.isPackaged}`);


// 1. ПОДКЛЮЧЕНИЕ ОБНОВЛЕНИЙ И ЛОГОВ
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// ИНИЦИАЛИЗАЦИЯ СЕРВИСА ПАРОЛЕЙ
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

// Инициализация остальных сервисов
const windowService = setupWindowService(userDataPath);
const proxyService = setupProxyService(userDataPath, createApplicationMenu);
const archiveService = setupArchiveService(userDataPath);

// =================================================================
// ПОСТОЯННЫЙ СТРИМИНГОВЫЙ ОБРАБОТЧИК ПЕРЕВОДА (ДЛЯ АВТОПЕРЕВОДА)
// =================================================================

// Хранилище активных процессов: { [tabId]: engineProcess }
const activeTranslators = new Map();

// Функция отправки пачки (вынесена отдельно, чтобы использовать повторно)
const sendBatchToPython = (engine, textArray) => {
    const BATCH_SIZE = 64; // Оптимальный размер пачки для параллелизма
    
    for (let i = 0; i < textArray.length; i += BATCH_SIZE) {
        const chunk = textArray.slice(i, i + BATCH_SIZE);
        const batchData = chunk.map((text, index) => ({
            id: i + index, // Начинаем с 0 для каждой новой отправки (индексы скорректирует фронтенд)
            text: text
        }));

        try {
            engine.stdin.write(JSON.stringify({ type: "batch", items: batchData }) + "\n");
        } catch (e) {
            console.error(`[Main]: Ошибка отправки пачки ${i}:`, e);
        }
    }

    // Финальный маркер завершения текущей задачи (НЕ убивает процесс)
    try {
        engine.stdin.write(JSON.stringify({ type: "signal", text: "__END_OF_BATCH__" }) + "\n");
    } catch (e) {}
};

// 1. Главный обработчик запросов на перевод
ipcMain.on('translate-text-request', (event, { tabId, textArray }) => {
    console.log(`[Main]: Запрос перевода для вкладки ${tabId}. Строк: ${textArray.length}`);

    let engine = activeTranslators.get(tabId);

    // ЕСЛИ ПРОЦЕСС УЖЕ ЖИВЕТ: просто докидываем ему новый текст (динамика/меню)
    if (engine && !engine.killed) {
        console.log(`[Main]: Движок для вкладки ${tabId} уже работает. Отправляю новую пачку.`);
        sendBatchToPython(engine, textArray);
        return;
    }

    // ИНАЧЕ: Спавним новый Python для этой вкладки
    console.log(`[Main]: Запуск нового инстанса Python для вкладки ${tabId}`);
    engine = spawn(pythonExecutable, [enginePath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    // Сохраняем в память
    activeTranslators.set(tabId, engine);

    // ИСПРАВЛЕНИЕ: Отправляем пачку СРАЗУ. Node.js запишет её в буфер пайпа, 
    // и Питон прочитает её автоматически, как только завершит инициализацию (from_pretrained).
    sendBatchToPython(engine, textArray);

    const rl = readline.createInterface({
        input: engine.stdout,
        terminal: false
    });

    engine.on('error', (err) => {
        console.error(`[Main CRITICAL]: Ошибка запуска Python для вкладки ${tabId}:`, err);
        activeTranslators.delete(tabId);
        event.reply('translate-text-final', { success: false, tabId: tabId, error: err.message });
    });

    // Слушаем логи ошибок (чисто для дебага в консоли Electron)
    engine.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (!message.includes('[Debug]: TOKENS') && !message.includes('[Debug]: OUTPUT TOKENS')) {
            console.error(`[Python Stderr ${tabId}]: ${message}`);
        }
    });

    // Построчно ловим ответы от Python
    rl.on('line', (line) => {
        try {
            if (!line.startsWith('{')) return;
            const response = JSON.parse(line);

            if (response.status === 'chunk') {
                // МГНОВЕННО пересылаем готовую строчку обратно в Renderer, указывая tabId
                event.reply('translate-text-chunk', {
                    tabId: tabId,
                    id: response.id,
                    translated: response.translated
                });
            } 
            else if (response.status === 'completed') {
                console.log(`[Main]: Python успешно перевел текущую пачку для вкладки ${tabId}. Ждет новых строк...`);
                event.reply('translate-text-final', { success: true, tabId: tabId });
            }
        } catch (e) {
            console.error(`[Main]: Ошибка парсинга потоковой строки от Python для ${tabId}:`, e);
        }
    });

    engine.on('exit', (code) => {
        console.log(`[Main]: Процесс Python для вкладки ${tabId} завершен (Код: ${code}). ОЗУ очищена.`);
        activeTranslators.delete(tabId);
    });
});

// 2. ОБЯЗАТЕЛЬНЫЙ ОБРАБОТЧИК: Убийство процесса (Вызывать при закрытии вкладки!)
ipcMain.on('kill-translator-for-tab', (event, tabId) => {
    const engine = activeTranslators.get(tabId);
    if (engine && !engine.killed) {
        engine.kill();
        activeTranslators.delete(tabId);
        console.log(`[Main]: Процесс Python для вкладки ${tabId} принудительно убит (Вкладка закрыта).`);
    }
});

const AGENTS = {
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.179 Safari/537.36 WebHub/4.0.0",
    mobile: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36 WebHub/4.0.0",
    IosMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 WebHub/4.0.0"
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
            backgroundThrottling: false,
            plugins: true
        }
    });

    win.webContents.session.setPermissionCheckHandler(() => true);
    win.webContents.session.setPermissionRequestHandler((w, p, callback) => callback(true));

    win.webContents.on('enter-html-full-screen', () => { win.setFullScreen(true); win.webContents.send('fullscreen-toggled', true); });
    win.webContents.on('leave-html-full-screen', () => { win.setFullScreen(false); win.webContents.send('fullscreen-toggled', false); });
    
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

    await proxyService.applyProxySettings();
    win.loadFile('index.html');
    return win;
}

app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy) {
        event.preventDefault();
        callback('admin', 'WebHub_Super_Secret_2026'); 
    }
});

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

app.whenReady().then(async () => {
    setupShortcutService(userDataPath, broadcast, archiveService);
  
    setUserAgent('desktop');

    // =================================================================
    // 1. РЕГИСТРАЦИЯ БРАУЗЕРА В СИСТЕМЕ (Новое)
    // =================================================================
    if (process.defaultApp) {
        // Настройки для среды разработки (npm start)
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
            app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        // Настройки для уже собранного .exe
        app.setAsDefaultProtocolClient('http');
        app.setAsDefaultProtocolClient('https');
    }
    // =================================================================

    await proxyService.applyProxySettings();
    createApplicationMenu();

    // 2. ИЗМЕНЕНО: Проверяем, прилетела ли веб-ссылка ИЛИ локальный файл (html/pdf) при первом старте
    const fileOrUrl = getFileOrUrl(process.argv);

    // Запускаем окно
    const win = await createWindow();

    // 3. ИЗМЕНЕНО: Если файл или ссылка были найдены, передаем их во вкладку после загрузки интерфейса
    if (fileOrUrl && win) {
        win.webContents.once('did-finish-load', () => {
            win.webContents.send('force-open-url', fileOrUrl);
        });
    }

    // =================================================================
    // ТВОИ СУЩЕСТВУЮЩИЕ ОБРАБОТЧИКИ (Сохранены)
    // =================================================================
    ipcMain.on('open-new-tab', (event, url) => {
        const mainWin = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html') && !w.isDestroyed());
        if (mainWin) mainWin.webContents.send('force-open-url', url);
    });

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
app.on('will-quit', () => { 
    globalShortcut.unregisterAll(); 
});

ipcMain.on('active-tab-pass-data-response', (event, data) => {
    const wins = BrowserWindow.getAllWindows();
    const passWin = wins.find(w => !w.isDestroyed() && w.webContents.getURL().includes('password-manager.html'));
    if (passWin) {
        passWin.webContents.send('active-tab-pass-data', data);
    }
});