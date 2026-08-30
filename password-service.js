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

        // --- ЕДИНАЯ НОРМАЛИЗАЦИЯ URL С HTTPS ---
        let cleanedUrl = entry.url ? entry.url.trim() : '';
        if (cleanedUrl && !/^https?:\/\//i.test(cleanedUrl)) {
            cleanedUrl = 'https://' + cleanedUrl;
        } else if (cleanedUrl.startsWith('http://')) {
            cleanedUrl = cleanedUrl.replace(/^http:\/\//i, 'https://');
        }

        try {
            const parsed = new URL(cleanedUrl);
            cleanedUrl = parsed.origin;
        } catch (e) {
            console.error("[Password Service] Ошибка нормализации URL:", e);
        }

        if (entry.id) {
            // Редактирование существующей записи
            const index = list.findIndex(p => p.id === entry.id);
            if (index !== -1) {
                list[index] = {
                    id: entry.id,
                    url: cleanedUrl,
                    username: entry.login, // сопоставляем login из формы с username в базе
                    password: entry.password
                };
            }
        } else {
            // Создание новой записи вручную через менеджер
            list.push({
                id: Date.now(),
                url: cleanedUrl,
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

    // 4. Импортировать пароли из CSV файла экспорта Firefox
    ipcMain.on('import-passwords-csv', async (event) => {
        const { dialog } = require('electron');
        
        const result = await dialog.showOpenDialog(passwordWin, {
            title: 'Выберите файл экспорта паролей Firefox (.csv)',
            filters: [{ name: 'Файлы CSV', extensions: ['csv'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return;

        try {
            const filePath = result.filePaths[0];
            const content = fsModule.readFileSync(filePath, 'utf8');
            
            const lines = content.split(/\r?\n/);
            if (lines.length < 2) return; 

            // Определяем индексы колонок на основе заголовков
            const headers = parseCsvLine(lines[0]);
            const urlIdx = headers.indexOf('url');
            const userIdx = headers.indexOf('username');
            const passIdx = headers.indexOf('password');

            if (urlIdx === -1 || userIdx === -1 || passIdx === -1) {
                dialog.showErrorBox('Ошибка импорта', 'Неверный формат CSV. Файл должен содержать колонки "url", "username" и "password".');
                return;
            }

            let importedCount = 0;
            let currentList = readAndDecryptVault();

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                
                const columns = parseCsvLine(lines[i]);
                if (columns.length <= Math.max(urlIdx, userIdx, passIdx)) continue;

                let url = columns[urlIdx];
                const username = columns[userIdx];
                const password = columns[passIdx];

                // Отсекаем служебные страницы Firefox
                if (url.startsWith('chrome://') || url.startsWith('about:')) continue;

                // --- ИСПРАВЛЕНО: Приведение URL к единому виду С ОБЯЗАТЕЛЬНЫМ HTTPS:// ---
                let cleanedUrl = url ? url.trim() : '';
                if (cleanedUrl && !/^https?:\/\//i.test(cleanedUrl)) {
                    cleanedUrl = 'https://' + cleanedUrl;
                } else if (cleanedUrl.startsWith('http://')) {
                    cleanedUrl = cleanedUrl.replace(/^http:\/\//i, 'https://');
                }

                try {
                    const parsedUrl = new URL(cleanedUrl);
                    cleanedUrl = parsedUrl.origin; // Сохранит в виде 'https://domain.com'
                } catch (e) {
                    console.error("[CSV Import] Не удалось распарсить URL:", cleanedUrl);
                }

                // Проверка на дубликаты по комбинации URL + Логин
                const exists = currentList.some(item => item.url === cleanedUrl && item.username === username);
                
                if (!exists) {
                    currentList.push({
                        id: Date.now() + importedCount, 
                        url: cleanedUrl,
                        username: username,
                        password: password
                    });
                    importedCount++;
                }
            }

            if (importedCount > 0) {
                const success = encryptAndSaveVault(currentList);
                if (success) {
                    event.reply('passwords-updated');
                    dialog.showMessageBox(passwordWin, {
                        type: 'info',
                        title: 'Импорт завершен',
                        message: `Успешно импортировано новых аккаунтов: ${importedCount}`
                    });
                }
            } else {
                dialog.showMessageBox(passwordWin, {
                    type: 'info',
                    title: 'Импорт',
                    message: 'Новых паролей для импорта не найдено (возможно, они уже есть в базе).'
                });
            }

        } catch (err) {
            console.error("Ошибка при импорте CSV:", err);
            dialog.showErrorBox('Ошибка', 'Не удалось прочитать или распарсить файл CSV.');
        }
    });

    // Вспомогательная функция разбора строки CSV с поддержкой экранирования кавычек
    function parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    // Переключатель окна
    ipcMain.on('toggle-password-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) togglePasswordWindow(win);
    });

    return { togglePasswordWindow };
}

module.exports = { setupPasswordService };