// vault-service.js
const { ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function setupVaultService(userDataPath) {
    const vaultPath = path.join(userDataPath, 'vault.json');

    // Вспомогательная функция для безопасного чтения и расшифровки базы
    function readVault() {
        if (!fs.existsSync(vaultPath)) return [];
        try {
            const rawData = fs.readFileSync(vaultPath, 'utf8');
            const encryptedList = JSON.parse(rawData);

            // Если safeStorage еще не готов (редкий случай при старте ОС), возвращаем пустоту
            if (!safeStorage.isEncryptionAvailable()) {
                console.error("[Vault] Нативное шифрование ОС недоступно.");
                return [];
            }

            // Расшифровываем пароли обратно в читаемый текст
            return encryptedList.map(item => {
                try {
                    const decryptedPassword = safeStorage.decryptString(Buffer.from(item.password, 'hex'));
                    return {
                        id: item.id,
                        url: item.url,
                        username: item.username,
                        password: decryptedPassword
                    };
                } catch (err) {
                    console.error(`[Vault] Не удалось расшифровать пароль для ${item.url}:`, err.message);
                    return null;
                }
            }).filter(Boolean); // Убираем битые записи, если они возникнут

        } catch (e) {
            console.error("[Vault] Ошибка при чтении файла сейфа:", e);
            return [];
        }
    }

    // Вспомогательная функция для шифрования и сохранения базы
    function saveVault(decryptedList) {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error("Нативное шифрование ОС недоступно.");
            }

            // Шифруем пароли перед записью на диск
            const encryptedList = decryptedList.map(item => {
                const encryptedBuffer = safeStorage.encryptString(item.password);
                return {
                    id: item.id,
                    url: item.url,
                    username: item.username,
                    password: encryptedBuffer.toString('hex') // сохраняем буфер как hex-строку в JSON
                };
            });

            fs.writeFileSync(vaultPath, JSON.stringify(encryptedList, null, 2), 'utf8');
            return true;
        } catch (e) {
            console.error("[Vault] Ошибка при сохранении сейфа:", e);
            return false;
        }
    }

    // ==========================================
    // ЛОГИКА ДЛЯ ИНТЕГРАЦИИ ЧЕРЕЗ CONSOLE-MESSAGE
    // ==========================================
    
    // Функция поиска аккаунта по hostname (вызывается из main.js)
    function findCredentials(hostname) {
        const list = readVault();
        // Ищем все записи, где хост содержится в сохраненном URL
        const matches = list.filter(item => item.url.includes(hostname));
        
        if (matches.length > 0) {
            // Возвращаем массив только с нужными данными
            return matches.map(item => ({
                username: item.username,
                password: item.password
            }));
        }
        return null;
    }

    // Функция сохранения/обновления аккаунта (вызывается из main.js)
    function saveCredentials(url, username, password) {
        let list = readVault();

        // Проверяем, есть ли уже запись для этого сайта и пользователя
        const existingIndex = list.findIndex(item => item.url === url && item.username === username);

        if (existingIndex !== -1) {
            // Если пароль изменился — обновляем
            if (list[existingIndex].password !== password) {
                list[existingIndex].password = password;
                console.log(`[Vault] Обновлен пароль для ${url}`);
            } else {
                return; // Ничего не поменялось, выходим
            }
        } else {
            // Создаем новую запись
            list.push({
                id: Date.now(),
                url,
                username,
                password
            });
            console.log(`[Vault] Добавлен новый пароль для ${url}`);
        }

        saveVault(list);
    }

    // Системный обработчик для интерфейса настроек (вывод списка без паролей в целях безопасности)
    ipcMain.handle('get-all-vault-items', async () => {
        return readVault().map(item => ({ 
            id: item.id, 
            url: item.url, 
            username: item.username 
        }));
    });

    // Экспортируем методы для прямого вызова внутри main.js
    return {
        findCredentials,
        saveCredentials
    };
}

module.exports = { setupVaultService };