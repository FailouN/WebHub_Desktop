const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

const blockerCachePath = path.join(app.getPath('userData'), 'adblocker.bin');

// Прямая ссылка на базу блокировщика на вашем сервере
const serverUrl = 'https://start-page.duckdns.org/updates/adblocker.bin';

// Хранилище активных сессий и их блокировщиков
const activeSessions = new Set();
const sessionBlockers = new WeakMap();
let currentBlockerInstance = null;
let isUpdateTrackingStarted = false;

/**
 * Мягко применяет блокировщик к конкретной сессии
 */
function applyBlockerToSession(sessionInstance, blocker) {
    if (!sessionInstance || sessionInstance.destroyed) return;

    try {
        const oldBlocker = sessionBlockers.get(sessionInstance);
        if (oldBlocker === blocker) return;

        if (oldBlocker) {
            oldBlocker.disableBlockingInSession(sessionInstance);
        }

        sessionBlockers.set(sessionInstance, blocker);
        blocker.enableBlockingInSession(sessionInstance);
    } catch (e) {
        console.error("AdBlock Apply Error:", e.message);
    }
}

/**
 * Функция проверки обновлений с личного сервера
 */
async function checkAndUpdate() {
    try {
        // Проверяем заголовки (HEAD)
        const check = await fetch(serverUrl, { method: 'HEAD' }).catch(() => null);
        if (!check || !check.ok) return; 

        const remoteSize = check.headers.get('content-length');
        const localStats = await fs.stat(blockerCachePath).catch(() => null);

        if (localStats && remoteSize && localStats.size === parseInt(remoteSize, 10)) {
            console.log('AdBlock: Обновление не требуется.');
            return;
        }

        const response = await fetch(serverUrl);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            await fs.writeFile(blockerCachePath, Buffer.from(uint8Array)).catch(() => {});
            
            // Создаем новый инстанс и обновляем его во всех живых сессиях
            currentBlockerInstance = await ElectronBlocker.deserialize(uint8Array);
            
            for (const sessionInstance of activeSessions) {
                if (sessionInstance.destroyed) {
                    activeSessions.delete(sessionInstance);
                } else {
                    applyBlockerToSession(sessionInstance, currentBlockerInstance);
                }
            }
            console.log('AdBlock: Списки успешно обновлены в фоне с личного сервера.');
        }
    } catch (err) {
        console.error('AdBlock Update Error:', err.message);
    }
}

/**
 * Инициализация фонового таймера обновлений (запускается один раз за жизнь приложения)
 */
function startUpdateLoop() {
    if (isUpdateTrackingStarted) return;
    isUpdateTrackingStarted = true;

    // Первый запуск через 30 секунд после старта
    setTimeout(checkAndUpdate, 30000); 

    // Повторять проверку каждые 24 часа
    setInterval(checkAndUpdate, 24 * 60 * 60 * 1000);
}

/**
 * ОСНОВНОЙ МЕТОД: Настройка блокировщика для сессии
 */
async function setupBlocker(sessionInstance) {
    if (!sessionInstance || sessionInstance.destroyed) return;

    activeSessions.add(sessionInstance);
    startUpdateLoop();

    // 1. Если блокировщик уже загружен в память — применяем сразу
    if (currentBlockerInstance) {
        applyBlockerToSession(sessionInstance, currentBlockerInstance);
        return;
    }

    // 2. АСИНХРОННЫЙ БЫСТРЫЙ СТАРТ ИЗ КЭША
    try {
        const stats = await fs.stat(blockerCachePath).catch(() => null);
        if (stats && stats.isFile()) {
            const buffer = await fs.readFile(blockerCachePath);
            currentBlockerInstance = await ElectronBlocker.deserialize(new Uint8Array(buffer));
            applyBlockerToSession(sessionInstance, currentBlockerInstance);
            console.log('AdBlock: Запущен из локального кэша.');
        }
    } catch (e) {
        console.error("AdBlock Fast Start Error:", e);
    }
}

async function disableBlocker(sessionInstance) {
    if (!sessionInstance || sessionInstance.destroyed) return;
    
    activeSessions.delete(sessionInstance);
    const blocker = sessionBlockers.get(sessionInstance);
    if (blocker) {
        blocker.disableBlockingInSession(sessionInstance);
        sessionBlockers.delete(sessionInstance);
    }
}

module.exports = { setupBlocker, disableBlocker };