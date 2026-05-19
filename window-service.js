// window-service.js
const { ipcMain, BrowserWindow, dialog, session, Menu } = require('electron');
const fsModule = require('fs');
const pathModule = require('path');

function setupWindowService(userDataPath) {
    
    async function handleCookieImport() {
        const win = BrowserWindow.getFocusedWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Выберите файл куков (JSON)',
            properties: ['openFile'],
            filters: [{ name: 'JSON Cookies', extensions: ['json'] }]
        });
        if (canceled || filePaths.length === 0) return;

        try {
            const rawData = fsModule.readFileSync(filePaths[0], 'utf8');
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
                    sameSite: cookie.name.startsWith('__Host') ? 'no_restriction' : undefined 
                };
                if (cookie.name.startsWith('__Secure-') || cookie.name.startsWith('__Host-')) {
                    cookieDetails.secure = true;
                }

                await currentSession.cookies.set(cookieDetails).catch(e => {
                    const ignoredErrors = ['invalid __Host-', 'overwritten a Secure cookie'];
                    if (!ignoredErrors.some(msg => e.message.includes(msg))) {
                        console.warn(`Ошибка куки ${cookie.name}:`, e.message);
                    }
                });
            }
            if (win) win.reload();
        } catch (err) {
            console.error("Ошибка импорта куков:", err);
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
            if (win) win.reload();
        }
    }

    // Системные события UI окна
    ipcMain.handle('window-minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });

    ipcMain.handle('window-maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (win.isMaximized()) win.ununmaximize ? win.ununmaximize() : win.unmaximize();
            else win.maximize();
        }
    });

    ipcMain.handle('window-close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
    });

    ipcMain.handle('show-context-menu', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const menu = Menu.getApplicationMenu();
        if (menu && win) menu.popup({ window: win });
    });

    ipcMain.handle('select-file', async (event) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
                properties: ['openFile'],
                filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp', 'jpeg'] }]
            });

            if (canceled || filePaths.length === 0) return null;

            const sourcePath = filePaths[0];
            const assetsFolder = pathModule.join(userDataPath, 'user_assets');

            if (!fsModule.existsSync(assetsFolder)) {
                fsModule.mkdirSync(assetsFolder, { recursive: true });
            }

            const fileName = `${Date.now()}_${pathModule.basename(sourcePath)}`;
            const destPath = pathModule.join(assetsFolder, fileName);
            
            fsModule.copyFileSync(sourcePath, destPath);
            return `file://${destPath.replace(/\\/g, '/')}`;
        } catch (err) {
            console.error("IPC Error [select-file]:", err);
            return null; 
        }
    });

    return { handleCookieImport, handleClearCookies };
}

module.exports = { setupWindowService };