// password-service.js
const { ipcMain, BrowserWindow, safeStorage } = require('electron');
const fsModule = require('fs');
const pathModule = require('path');

let passwordWin = null;

function setupPasswordService(userDataPath, vaultService) {
    const vaultPath = pathModule.join(userDataPath, 'vault.json');

    // Вспомогательная функция для чтения и полной расшифровки базы (чтобы отобразить в менеджере)
    function readAndDecryptVault() {
        if (!fsModule.existsSync(vaultPath)) return [];
        try {
            const rawData = fsModule.readFileSync(vaultPath, 'utf8');
            const encryptedList = JSON.parse(rawData);

            if (!safeStorage.isEncryptionAvailable()) {
                console.error("[Password Service] Нативное шифрование ОС недоступно.");
                return [];
            }

            return encryptedList.map(item => {
                try {
                    const decryptedPassword = safeStorage.decryptString(Buffer.from(item.password, 'hex'));
                    return {
                        id: item.id,
                        url: item.url,
                        username: item.username,
                        password: decryptedPassword // Передаем чистый текст в окно менеджера
                    };
                } catch (err) {
                    console.error(`[Password Service] Ошибка расшифровки для ${item.url}:`, err.message);
                    return null;
                }
            }).filter(Boolean);
        } catch (e) {
            console.error("[Password Service] Ошибка чтения vault.json:", e);
            return [];
        }
    }

    // Вспомогательная функция для шифрования и сохранения списка обратно в vault.json
    function encryptAndSaveVault(list) {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error("Нативное шифрование недоступно");
            }

            const encryptedList = list.map(item => {
                const encryptedBuffer = safeStorage.encryptString(item.password);
                return {
                    id: item.id,
                    url: item.url,
                    username: item.username,
                    password: encryptedBuffer.toString('hex') // Сохраняем в зашифрованном hex-формате
                };
            });

            fsModule.writeFileSync(vaultPath, JSON.stringify(encryptedList, null, 2));
            return true;
        } catch (e) {
            console.error("[Password Service] Не удалось сохранить зашифрованный vault:", e);
            return false;
        }
    }

    function togglePasswordWindow(parentWin) {
        if (passwordWin && !passwordWin.isDestroyed()) {
            passwordWin.close();
            return;
        }

        const parentBounds = parentWin.getBounds();
        const width = 750;
        const height = 550;

        const x = Math.round(parentBounds.x + (parentBounds.width - width) / 2);
        const y = Math.round(parentBounds.y + (parentBounds.height - height) / 2);

        passwordWin = new BrowserWindow({
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

        passwordWin.loadFile(pathModule.join(__dirname, 'password-manager.html'));

        passwordWin.webContents.on('did-finish-load', () => {
            parentWin.webContents.send('request-active-tab-data-for-pass');
        });

        passwordWin.on('closed', () => {
            passwordWin = null;
        });
    }

    // --- IPC ОБРАБОТЧИКИ ДЛЯ МЕНЕДЖЕРА ПАРОЛЕЙ ---

    // 1. Получить все пароли в расшифрованном виде для вывода в интерфейс менеджера
    ipcMain.handle('get-passwords', async () => {
        return readAndDecryptVault();
    });

    // 2. Сохранить новый или обновить существующий пароль из интерфейса менеджера
    ipcMain.on('save-password', (event, entry) => {
        let list = readAndDecryptVault();

        if (entry.id) {
            // Редактирование существующей записи
            const index = list.findIndex(p => p.id === entry.id);
            if (index !== -1) {
                list[index] = {
                    id: entry.id,
                    url: entry.url,
                    username: entry.login, // сопоставляем login из формы с username в базе
                    password: entry.password
                };
            }
        } else {
            // Создание новой записи вручную через менеджер
            list.push({
                id: Date.now(),
                url: entry.url,
                username: entry.login,
                password: entry.password
            });
        }

        const success = encryptAndSaveVault(list);
        if (success) {
            event.reply('passwords-updated');
        }
    });

    // 3. Удалить пароль из интерфейса менеджера
    ipcMain.on('delete-password', (event, entryId) => {
        let list = readAndDecryptVault();
        list = list.filter(p => p.id !== entryId);

        const success = encryptAndSaveVault(list);
        if (success) {
            event.reply('passwords-updated');
        }
    });

    // Переключатель окна
    ipcMain.on('toggle-password-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) togglePasswordWindow(win);
    });

    return { togglePasswordWindow };
}

module.exports = { setupPasswordService };