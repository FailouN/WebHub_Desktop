// shortcut-service.js
const { globalShortcut, ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

let shortcutsWin = null;

// Хоткеи по умолчанию, включая Архиватор
const DEFAULT_SHORTCUTS = {
    'execute-archive-toggle': 'CommandOrControl+H', // <-- Добавили по умолчанию
    'execute-yandex-play': 'Alt+F7',
    'execute-yandex-next': 'Alt+F6',
    'execute-yandex-prev': 'Alt+F5',
    'execute-discord-answer': 'Alt+`',
    'execute-discord-mute': 'CommandOrControl+Shift+M'
};

// Понятные пользователю имена для интерфейса настроек
const SHORTCUT_LABELS = {
    'execute-archive-toggle': 'Архиватор: Открыть/Скрыть окно', // <-- Красивое имя
    'execute-yandex-play': 'Яндекс.Музыка: Старт/Пауза',
    'execute-yandex-next': 'Яндекс.Музыка: Следующий трек',
    'execute-yandex-prev': 'Яндекс.Музыка: Предыдущий трек',
    'execute-discord-answer': 'Discord: Ответить на звонок',
    'execute-discord-mute': 'Discord: Вкл/Выкл микрофон'
};

// ТЕПЕРЬ ПРИНИМАЕМ archiveService третьим параметром
function setupShortcutService(userDataPath, broadcastFn, archiveService) {
    const configPath = path.join(userDataPath, 'shortcuts.json');

    // Чтение текущих хоткеев из файла
    function loadShortcuts() {
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify(DEFAULT_SHORTCUTS, null, 2));
            return DEFAULT_SHORTCUTS;
        }
        try {
            const data = fs.readFileSync(configPath, 'utf8');
            return { ...DEFAULT_SHORTCUTS, ...JSON.parse(data) };
        } catch (e) {
            console.error('[Shortcuts] Ошибка чтения файла настроек:', e);
            return DEFAULT_SHORTCUTS;
        }
    }

    // Применение (регистрация) хоткеев в системе
    function registerAll() {
        globalShortcut.unregisterAll();

        const shortcuts = loadShortcuts();

        for (const [action, keyCombo] of Object.entries(shortcuts)) {
            if (!keyCombo || keyCombo.trim() === '') continue;

            try {
                if (globalShortcut.isRegistered(keyCombo)) {
                    console.warn(`[Shortcuts] Комбинация ${keyCombo} уже занята другим приложением в Windows!`);
                }

                const success = globalShortcut.register(keyCombo, () => {
                    console.log(`[Shortcuts] Сработал хоткей: ${keyCombo} -> ${action}`);
                    
                    // ОБРАБОТКА ДЛЯ АРХИВАТОРА
                    if (action === 'execute-archive-toggle') {
                        const focusedWin = BrowserWindow.getFocusedWindow();
                        if (focusedWin && archiveService) {
                            archiveService.toggleArchiveWindow(focusedWin);
                            focusedWin.setMenuBarVisibility(false);
                        }
                    } else {
                        // Все остальные команды транслируем на вкладки (Яндекс, Дискорд и т.д.)
                        broadcastFn(action);
                    }
                });

                if (!success) {
                    console.error(`[Shortcuts] ОС заблокировала регистрацию: ${keyCombo} для ${action}`);
                }
            } catch (err) {
                console.error(`[Shortcuts] Ошибка формата комбинации "${keyCombo}":`, err.message);
            }
        }
    }

    // Функция управления модальным окном хоткеев
    function toggleShortcutsWindow(parentWin) {
        if (shortcutsWin && !shortcutsWin.isDestroyed()) {
            shortcutsWin.close();
            return;
        }

        const parentBounds = parentWin.getBounds();
        const width = 550;
        const height = 480;

        const x = Math.round(parentBounds.x + (parentBounds.width - width) / 2);
        const y = Math.round(parentBounds.y + (parentBounds.height - height) / 2);

        shortcutsWin = new BrowserWindow({
            width: width,
            height: height,
            x: x,
            y: y,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            parent: parentWin,
            modal: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        shortcutsWin.loadFile(path.join(__dirname, 'shortcuts-manager.html'));
    }

    // --- IPC Обработчики ---

    ipcMain.on('toggle-shortcuts-window', (event) => {
        const webContents = event.sender || event;
        if (webContents) {
            const parentWin = BrowserWindow.fromWebContents(webContents);
            if (parentWin) {
                toggleShortcutsWindow(parentWin);
            }
        }
    });

    ipcMain.handle('get-shortcuts-config', async () => {
        const current = loadShortcuts();
        return Object.keys(DEFAULT_SHORTCUTS).map(action => ({
            action: action,
            label: SHORTCUT_LABELS[action] || action,
            value: current[action] || ''
        }));
    });

    ipcMain.handle('save-shortcuts-config', async (event, newShortcutsMap) => {
        try {
            fs.writeFileSync(configPath, JSON.stringify(newShortcutsMap, null, 2));
            registerAll();
            return { success: true };
        } catch (e) {
            console.error('[Shortcuts] Ошибка сохранения:', e);
            return { success: false, error: e.message };
        }
    });

    registerAll();
}

module.exports = { setupShortcutService };