const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

let activeBlocker = null;

async function setupBlocker(sessionInstance) {
    if (!sessionInstance || sessionInstance.destroyed) return;

    const blockerCachePath = path.join(app.getPath('userData'), 'adblocker.bin');
    const githubUrl = 'https://github.com/FailouN/WebHub_Desktop/releases/download/1.0.0/adblocker.bin';

    // Функция мягкого применения без обнуления хуков
    const applyBlocker = (blocker) => {
        try {
            // Если блокер уже тот же самый — ничего не делаем
            if (activeBlocker === blocker) return;

            // Нативно отключаем предыдущий, если он был (это быстрее, чем .onBeforeRequest(null))
            if (activeBlocker) {
                activeBlocker.disableBlockingInSession(sessionInstance);
            }

            activeBlocker = blocker;
            activeBlocker.enableBlockingInSession(sessionInstance);
        } catch (e) {
            console.error("AdBlock Apply Error:", e.message);
        }
    };

    // 1. АСИНХРОННЫЙ БЫСТРЫЙ СТАРТ
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

    // 2. ФОНОВОЕ ОБНОВЛЕНИЕ (увеличиваем интервал до 30 сек, чтобы не мешать старту)
    setTimeout(async () => {
        try {
            if (!sessionInstance || sessionInstance.destroyed) return;

            // Используем HEAD запрос, чтобы проверить размер файла перед скачиванием
            const check = await fetch(githubUrl, { method: 'HEAD' });
            const remoteSize = check.headers.get('content-length');
            const localStats = await fs.stat(blockerCachePath).catch(() => null);

            // Если размер совпадает, не скачиваем заново (экономим трафик и CPU)
            if (localStats && remoteSize && localStats.size === parseInt(remoteSize)) {
                console.log('AdBlock: Обновление не требуется (файлы идентичны).');
                return;
            }

            const response = await fetch(githubUrl);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Сохраняем в фоне, не блокируя применение
                fs.writeFile(blockerCachePath, Buffer.from(uint8Array)).catch(() => {});
                
                const newBlocker = await ElectronBlocker.deserialize(uint8Array);
                applyBlocker(newBlocker);
                console.log('AdBlock: Списки обновлены в фоне.');
            }
        } catch (err) {
            console.error('AdBlock Update Error:', err.message);
        }
    }, 30000); 
}

async function disableBlocker(sessionInstance) {
    if (!sessionInstance) return;
    if (activeBlocker) {
        activeBlocker.disableBlockingInSession(sessionInstance);
        // Не зануляем activeBlocker глобально, чтобы при повторном включении 
        // он подхватился мгновенно, а не десериализовался заново
    }
}

module.exports = { setupBlocker, disableBlocker };