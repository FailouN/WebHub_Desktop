const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

async function setupBlocker(sessionInstance) {
    if (!sessionInstance || sessionInstance.destroyed) return;

    const blockerCachePath = path.join(app.getPath('userData'), 'adblocker.bin');
    // Динамически получаем текущую версию из package.json приложения, чтобы не шить хардкод
    const appVersion = app.getVersion();
    const githubUrl = `https://github.com/FailouN/WebHub_Desktop/releases/download/${appVersion}/adblocker.bin`;

    // Функция мягкого применения, изолированная для конкретной сессии
    const applyBlocker = (blocker) => {
        try {
            if (!sessionInstance || sessionInstance.destroyed) return;

            // Если в этой конкретной сессии уже работает этот же блокер — выходим
            if (sessionInstance.activeBlockerInstance === blocker) return;

            // Отключаем старый блокер именно у этой сессии, если он был
            if (sessionInstance.activeBlockerInstance) {
                sessionInstance.activeBlockerInstance.disableBlockingInSession(sessionInstance);
            }

            // Запоминаем экземпляр внутри самой сессии
            sessionInstance.activeBlockerInstance = blocker;
            sessionInstance.activeBlockerInstance.enableBlockingInSession(sessionInstance);
        } catch (e) {
            console.error("AdBlock Apply Error:", e.message);
        }
    };

    // 1. АСИНХРОННЫЙ БЫСТРЫЙ СТАРТ ИЗ КЭША
    try {
        const stats = await fs.stat(blockerCachePath).catch(() => null);
        if (stats && stats.isFile()) {
            const buffer = await fs.readFile(blockerCachePath);
            const blocker = await ElectronBlocker.deserialize(new Uint8Array(buffer));
            applyBlocker(blocker);
            console.log('AdBlock: Запущен из локального кэша.');
        }
    } catch (e) {
        console.error("AdBlock Fast Start Error:", e);
    }

    // Функция проверки обновлений
    const checkAndUpdate = async () => {
        try {
            if (!sessionInstance || sessionInstance.destroyed) return;

            // Проверяем заголовки (HEAD)
            const check = await fetch(githubUrl, { method: 'HEAD' }).catch(() => null);
            if (!check || !check.ok) {
                // Если релиза с такой версией еще нет на гитхабе, откатываемся на универсальный master/main или старый урл
                return; 
            }

            const remoteSize = check.headers.get('content-length');
            const localStats = await fs.stat(blockerCachePath).catch(() => null);

            if (localStats && remoteSize && localStats.size === parseInt(remoteSize)) {
                console.log('AdBlock: Обновление не требуется.');
                return;
            }

            const response = await fetch(githubUrl);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                
                await fs.writeFile(blockerCachePath, Buffer.from(uint8Array)).catch(() => {});
                
                const newBlocker = await ElectronBlocker.deserialize(uint8Array);
                applyBlocker(newBlocker);
                console.log('AdBlock: Списки обновлены в фоне.');
            }
        } catch (err) {
            console.error('AdBlock Update Error:', err.message);
        }
    };

    // 2. ФОНОВОЕ ОБНОВЛЕНИЕ
    // Первый запуск через 30 секунд после старта
    setTimeout(checkAndUpdate, 30000); 

    // Повторять проверку каждые 24 часа (на случай долгой работы приложения)
    setInterval(checkAndUpdate, 24 * 60 * 60 * 1000);
}

async function disableBlocker(sessionInstance) {
    if (!sessionInstance || sessionInstance.destroyed) return;
    
    // Отключаем блокер именно у той сессии, которую запросили
    if (sessionInstance.activeBlockerInstance) {
        sessionInstance.activeBlockerInstance.disableBlockingInSession(sessionInstance);
    }
}

module.exports = { setupBlocker, disableBlocker };