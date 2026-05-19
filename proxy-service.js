// proxy-service.js
const { ipcMain, session, fs, path, app, Menu, BrowserWindow } = require('electron');
const fsModule = require('fs');
const pathModule = require('path');

function setupProxyService(userDataPath, createApplicationMenu) {
    const proxyBypassPath = pathModule.join(userDataPath, 'proxy_bypass.json');

    function applyProxySettings() {
        const baseBypass = ["vk.com", "m.vk.com", "google.com", "yandex.ru", "mail.yandex.ru", "kinopoisk.ru", "www.kinopoisk.ru", "disk.yandex.ru", "2ip.ru", "ya.ru", "mail.ru"];
        let savedDomains = [];
        
        if (fsModule.existsSync(proxyBypassPath)) {
            try {
                savedDomains = JSON.parse(fsModule.readFileSync(proxyBypassPath, 'utf8'));
            } catch (e) { console.error("Proxy file error:", e); }
        }

        const uniqueBypass = [...new Set([...baseBypass, ...savedDomains])];
        const bypassList = uniqueBypass.join(", ");

        const proxyConfig = {
            proxyRules: "http://77.239.104.196:54921", 
            proxyBypassRules: bypassList
        };

        return session.defaultSession.setProxy(proxyConfig)
            .then(() => console.log('Proxy applied. Unique Bypass:', bypassList))
            .catch(err => console.error('Proxy setup error:', err));
    }

    function getSavedProxyDomains() {
        if (fsModule.existsSync(proxyBypassPath)) {
            try {
                const data = JSON.parse(fsModule.readFileSync(proxyBypassPath, 'utf8'));
                return Array.isArray(data) ? data : [];
            } catch (e) {
                console.error("Ошибка чтения файла исключений:", e);
                return [];
            }
        }
        return [];
    }

    function removeProxyDomain(domain) {
        if (fsModule.existsSync(proxyBypassPath)) {
            try {
                let list = JSON.parse(fsModule.readFileSync(proxyBypassPath, 'utf8'));
                list = list.filter(d => d !== domain);
                fsModule.writeFileSync(proxyBypassPath, JSON.stringify(list));
                applyProxySettings();
                createApplicationMenu();
            } catch (e) { 
                console.error("Ошибка при удалении домена:", e); 
            }
        }
    }

    // Обработчики IPC
    ipcMain.handle('save-proxy-domain', (event, domain) => {
        let list = [];
        if (fsModule.existsSync(proxyBypassPath)) {
            try { list = JSON.parse(fsModule.readFileSync(proxyBypassPath, 'utf8')); } catch(e){}
        }
        if (!list.includes(domain)) {
            list.push(domain);
            fsModule.writeFileSync(proxyBypassPath, JSON.stringify(list));
            applyProxySettings();
            createApplicationMenu();
        }
    });

    ipcMain.handle('delete-proxy-domain', (event, domain) => {
        removeProxyDomain(domain);
    });

    ipcMain.handle('get-proxy-bypass-list', () => {
        return getSavedProxyDomains();
    });

    return { applyProxySettings, getSavedProxyDomains, removeProxyDomain };
}

module.exports = { setupProxyService };