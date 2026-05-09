const { app, BrowserWindow, globalShortcut, ipcMain, session, desktopCapturer, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupBlocker, disableBlocker } = require('./adblocker');
const { setupScreenShare } = require('./screen-share');

let isAdBlockEnabled = true;


const { exec } = require('child_process');

const fetch = require('cross-fetch');

// 1. ПОДКЛЮЧЕНИЕ ОБНОВЛЕНИЙ И ЛОГОВ
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';


// Реальный путь к данным в профиле пользователя (%APPDATA%)
const userDataPath = path.join(app.getPath('appData'), 'WebHub-Desktop-profile');
const gpuSettingsPath = path.join(userDataPath, 'gpu-settings.json');

function isGpuEnabled() {
    try {
        if (fs.existsSync(gpuSettingsPath)) {
            const data = JSON.parse(fs.readFileSync(gpuSettingsPath, 'utf8'));
            return data.enabled !== false;
        }
    } catch (e) { console.error(e); }
    return true; 
}

// ОБЯЗАТЕЛЬНО ОБЪЯВИ ЭТУ ПЕРЕМЕННУЮ ЗДЕСЬ:
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
// Путь для папки-ссылки в директории программы
const linkPath = path.join(process.cwd(), 'DATA_LINK'); 

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Устанавливаем путь к userData до готовности приложения
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}
app.setPath('userData', userDataPath);


async function handleCookieImport() {
    const win = BrowserWindow.getFocusedWindow();

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Выберите файл куков (JSON)',
        properties: ['openFile'],
        filters: [{ name: 'JSON Cookies', extensions: ['json'] }]
    });
    if (canceled || filePaths.length === 0) return;

    try {
        const rawData = fs.readFileSync(filePaths[0], 'utf8');
        const cookies = JSON.parse(rawData);
        const currentSession = session.defaultSession;
        for (const cookie of cookies) {
            const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
            const url = `${cookie.secure || cookie.name.startsWith('__Secure-') || cookie.name.startsWith('__Host-') ? 'https' : 'http'}://${domain}${cookie.path}`;

            const cookieDetails = {
                url: url,
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                expirationDate: cookie.expirationDate,
                // Добавляем принудительно SameSite, если его нет, чтобы Secure куки проходили
                sameSite: cookie.name.startsWith('__Host') ? 'no_restriction' : undefined 
            };
            // Если кука имеет защищенный префикс, она ОБЯЗАНА быть secure
            if (cookie.name.startsWith('__Secure-') || cookie.name.startsWith('__Host-')) {
                cookieDetails.secure = true;
            }

            await currentSession.cookies.set(cookieDetails).catch(e => {
    // Игнорируем специфические ошибки префиксов и перезаписи secure-кук
    const ignoredErrors = ['invalid __Host-', 'overwritten a Secure cookie'];
    if (!ignoredErrors.some(msg => e.message.includes(msg))) {
        console.warn(`Ошибка куки ${cookie.name}:`, e.message);
    }
});
        }
        console.log('import coocies completed');
        if (win) win.reload(); // Перезагружаем для применения авторизации

    } catch (err) {
        console.error("Ошибка импорта:", err);
        dialog.showErrorBox('Ошибка', 'Could not read or set cookie.');
    }
}

async function handleClearCookies() {
    const win = BrowserWindow.getFocusedWindow();
    const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Отмена', 'Да, удалить всё'],
        defaultId: 1,
        title: 'Подтверждение',
        message: 'Вы уверены, что хотите удалить все куки и данные авторизации?',
        detail: 'Это приведет к выходу из всех аккаунтов на всех сайтах.'
    });

    if (response === 1) {
        await session.defaultSession.clearStorageData();
        console.log('Все куки и данные очищены.');
        if (win) win.reload();
    }
}

// Определяем доступные UA
const AGENTS = {
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    mobile: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36", // <--- ТУТ НУЖНА ЗАПЯТАЯ
    IosMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1" // <--- ТУТ УБРАЛ ТОЧКУ С ЗАПЯТОЙ
};

function setUserAgent(type) {
    const newUA = AGENTS[type];
    if (!newUA) return;

    session.defaultSession.setUserAgent(newUA);
    
    // Получаем все окна и webview
    const wins = BrowserWindow.getAllWindows();
    wins.forEach(w => {
        // Перезагружаем контент только если он уже загружен
        if (!w.webContents.isLoading()) {
            w.webContents.reload();
        }
    });
    
    // Используем правильную кодировку для консоли (чтобы не было кракозябр)
    console.log(`User-Agent changed to: ${type}`);
}


// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И ФУНКЦИИ ПРОКСИ (Вынеси их сюда)
const proxyBypassPath = path.join(userDataPath, 'proxy_bypass.json');

function applyProxySettings() {
    // Базовый список
    const baseBypass = ["vk.com", "m.vk.com", "google.com", "yandex.ru", "mail.yandex.ru", "kinopoisk.ru", "www.kinopoisk.ru", "disk.yandex.ru", "2ip.ru", "ya.ru", "mail.ru"];
    
    let savedDomains = [];
    if (fs.existsSync(proxyBypassPath)) {
        try {
            savedDomains = JSON.parse(fs.readFileSync(proxyBypassPath, 'utf8'));
        } catch (e) { console.error("Proxy file error:", e); }
    }

    // Объединяем и убираем дубликаты
    const uniqueBypass = [...new Set([...baseBypass, ...savedDomains])];
    const bypassList = uniqueBypass.join(", ");

    const proxyConfig = {
        proxyRules: "http://77.239.104.196:8888",
        proxyBypassRules: bypassList
    };

    return session.defaultSession.setProxy(proxyConfig)
        .then(() => console.log('Proxy applied. Unique Bypass:', bypassList))
        .catch(err => console.error('Proxy setup error:', err));
}

// 2. ОБРАБОТЧИКИ IPC (Тоже глобально)
ipcMain.handle('save-proxy-domain', (event, domain) => {
    let list = [];
    if (fs.existsSync(proxyBypassPath)) {
        try { list = JSON.parse(fs.readFileSync(proxyBypassPath, 'utf8')); } catch(e){}
    }
    if (!list.includes(domain)) {
        list.push(domain);
        fs.writeFileSync(proxyBypassPath, JSON.stringify(list));
        applyProxySettings();
        createApplicationMenu();
    }
});

ipcMain.handle('delete-proxy-domain', (event, domain) => {
    removeProxyDomain(domain); // Используем общую функцию
});

function getSavedProxyDomains() {
    if (fs.existsSync(proxyBypassPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(proxyBypassPath, 'utf8'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Ошибка чтения файла исключений:", e);
            return [];
        }
    }
    return [];
}

/**
 * СОЗДАНИЕ ПРИКЛАДНОГО МЕНЮ
 */
function createApplicationMenu() {
    const savedDomains = getSavedProxyDomains();
    const template = [
        {
            label: 'Аккаунты',
            submenu: [
                {
                    label: 'Импортировать профиль (JSON)',
                    accelerator: 'CmdOrCtrl+I',
                    click: () => { handleCookieImport(); }
                },

                {
                    label: 'Удалить все куки',
                    click: () => { handleClearCookies(); }
                },

                {
                 label: 'Проверить наличие обновлений',
                   click: () => { autoUpdater.checkForUpdatesAndNotify(); }
                 },

                { type: 'separator' },
                { role: 'reload', label: 'Перезагрузить страницу' },
                { role: 'quit', label: 'Выход' }
            ]
        },
       {
            label: 'Прокси',
            submenu: [
                {
                    label: 'Добавить текущий сайт в исключения',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.send('get-current-domain-for-proxy');
                    }
                },
                {
                    label: 'Удалить из исключений',
                    // Кнопка будет неактивна, если список пуст
                    enabled: savedDomains.length > 0, 
                    submenu: savedDomains.map(domain => {
                        return {
                            label: domain,
                            click: () => {
                                // Вызываем удаление конкретного домена
                                // Мы имитируем вызов IPC события
                                removeProxyDomain(domain);
                            }
                        };
                    })
                },
                { type: 'separator' },
                {
                    label: 'Очистить весь список',
                    click: () => {
                        if (fs.existsSync(proxyBypassPath)) {
                            fs.unlinkSync(proxyBypassPath);
                            applyProxySettings();
                            createApplicationMenu(); // Обновляем меню после очистки
                            dialog.showMessageBox({ message: "Список исключений очищен" });
                        }
                    }
                }
            ]
        },
        
        {
            label: 'Система',
            submenu: [
                {
                    label: 'Режим отображения',
                    submenu: [
                        { 
                            label: 'Компьютер (Desktop)', 
                            click: () => setUserAgent('desktop') 
                        },
                        { 
                            label: 'Телефон (Mobile)', 
                            click: () => setUserAgent('mobile') 
                        },
                        { 
                            label: 'Ios (Mobile)', 
                            click: () => setUserAgent('IosMobile') 
                        }
                    ]
                },
                {
    label: 'Блокировщик рекламы',
    type: 'checkbox',
    checked: isAdBlockEnabled,
    click: async () => {
        isAdBlockEnabled = !isAdBlockEnabled;
        
        if (isAdBlockEnabled) {
            await setupBlocker(session.defaultSession);
        } else {
            await disableBlocker(session.defaultSession);
            
            // КРИТИЧЕСКИ ВАЖНО ДЛЯ ТЕСТОВ:
            // Очищаем кэш и данные HTTP, чтобы сайты увидели изменения мгновенно
            await session.defaultSession.clearStorageData({
                storages: ['cachestorage', 'shadercache']
            });
        }

        // ОБЯЗАТЕЛЬНО: Перерисовываем меню, чтобы зафиксировать галочку
        createApplicationMenu();
        
        // Уведомление
        dialog.showMessageBox({
            type: 'info',
            message: `Блокировщик ${isAdBlockEnabled ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`,
            detail: 'Приложения и вкладки автоматически обновятся.'
        });

        // Перезагружаем все окна, чтобы применить настройки
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
                    if (response === 0) {
                        app.relaunch();
                        app.exit();
                    }
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

// Настройка событий авто-апдейтера
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Обновление',
        message: 'Найдена новая версия. Загружаю в фоне...',
        buttons: ['Ок']
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'question',
        buttons: ['Установить и перезапустить', 'Позже'],
        defaultId: 0,
        title: 'Обновление готово',
        message: 'Новая версия скачана. Перезагрузить программу для установки?'
    }).then(result => {
        if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

autoUpdater.on('error', (message) => {
    console.error('Ошибка обновления:', message);
});

/**
 * ОСНОВНОЕ ОКНО ПРИЛОЖЕНИЯ
 */
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
            offscreen: false, 
            canvas: true,     
            webgl: true
        }
    });

const ses = win.webContents.session;

    // 1. Инициализируем блокировщик (если включен)
    if (isAdBlockEnabled) {
        setupBlocker(ses);
    }

    // 2. Инициализируем захват экрана (наш новый красивый модуль)
    setupScreenShare(ses);


     setUserAgent('desktop');

  applyProxySettings().then(() => {
     win.loadFile('index.html');
 });



   
}

// Авторизация на прокси
app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy) {
        event.preventDefault();
        callback('user', 'pass123'); // Твои данные Gost
    }
});

ipcMain.handle('select-file', async () => {
    // 1. Получаем окно для модальности
    const win = BrowserWindow.getFocusedWindow();
    
    // 2. Открываем диалог выбора файла
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp', 'jpeg'] }]
    });

    if (canceled || filePaths.length === 0) return null;

    const sourcePath = filePaths[0];
    
    // 3. Получаем путь к папке данных пользователя (AppData/Roaming/название_вашего_апп)
    const assetsFolder = path.join(userDataPath, 'user_assets');

    // 4. Проверяем, существует ли папка, если нет — создаем
    if (!fs.existsSync(assetsFolder)) {
        fs.mkdirSync(assetsFolder, { recursive: true });
    }

    // 5. Формируем конечное имя и путь
    const fileName = Date.now() + "_" + path.basename(sourcePath);
    const destPath = path.join(assetsFolder, fileName);
    
    try {
        // 6. Копируем файл
        fs.copyFileSync(sourcePath, destPath);
        
        // 7. Возвращаем путь. 
        // ВАЖНО: Добавляем протокол file://, чтобы Electron/Chrome разрешил загрузку
        const finalPath = `file://${destPath.replace(/\\/g, '/')}`;
        console.log("Файл сохранен в:", finalPath);
        return finalPath; 
    } catch (err) {
        console.error("Ошибка при копировании файла:", err);
        return null;
    }
});
// Запуск приложения
app.whenReady().then(async () => {
    // 1. Сначала применяем прокси (если это нужно глобально до запуска окон)
    await applyProxySettings();
    
    // 2. Создаем меню
    createApplicationMenu();
    
    // 3. Создаем главное окно
    await createWindow();

    // --- РЕГИСТРАЦИЯ ГЛОБАЛЬНЫХ ХОТКЕЕВ ---
    
    // F11: Полноэкранный режим
    globalShortcut.register('F11', () => {
        const focusedWin = BrowserWindow.getFocusedWindow();
        if (focusedWin) {
            const state = !focusedWin.isFullScreen();
            focusedWin.setFullScreen(state);
            focusedWin.setMenuBarVisibility(false);
            focusedWin.webContents.send('fullscreen-toggled', state);
        }
    });
    
    // Alt+F7 - Play/Pause
globalShortcut.register('Alt+F7', () => {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('execute-yandex-play');
    });
});

// Alt+F6 - Next
globalShortcut.register('Alt+F6', () => {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('execute-yandex-next');
    });
});

// Alt+F5 - Previous
globalShortcut.register('Alt+F5', () => {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('execute-yandex-prev');
    });
});

    // Alt + Ё: Автоответ в Дискорде
    globalShortcut.register('Alt+`', () => {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('execute-discord-answer');
        });
        console.log('Global Hotkey: Alt+Ё pressed');
    });

    // Ctrl + Shift + M: Автоответ в Дискорде
    globalShortcut.register('Ctrl+Shift+M', () => {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('execute-discord-mute');
        });
        console.log('Global Hotkey: Ctrl+Shift+M pressed');
    });

    // --- ПРОВЕРКА ОБНОВЛЕНИЙ ---
    setTimeout(() => { 
        autoUpdater.checkForUpdatesAndNotify(); 
    }, 3000);

});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
}); 

// МЕСТО для очистки глобальных клавиш:
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

ipcMain.handle('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
});

ipcMain.handle('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

ipcMain.handle('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
});

ipcMain.handle('show-context-menu', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const menu = Menu.getApplicationMenu();
    if (menu && win) {
        menu.popup({ window: win });
    }
});

ipcMain.handle('get-proxy-bypass-list', () => {
    return getSavedProxyDomains();
});

function removeProxyDomain(domain) {
    if (fs.existsSync(proxyBypassPath)) {
        try {
            let list = JSON.parse(fs.readFileSync(proxyBypassPath, 'utf8'));
            list = list.filter(d => d !== domain);
            fs.writeFileSync(proxyBypassPath, JSON.stringify(list));
            applyProxySettings(); // Применяем новые настройки прокси
            createApplicationMenu(); // Обновляем само меню
        } catch (e) { 
            console.error("Ошибка при удалении домена:", e); 
        }
    }
}
