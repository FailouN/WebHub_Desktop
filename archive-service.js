// archive-service.js
const { ipcMain, BrowserWindow, path, fs } = require('electron');
const fsModule = require('fs');
const pathModule = require('path');

let archiveWin = null;

function setupArchiveService(userDataPath) {
    const archivePath = pathModule.join(userDataPath, 'archive.json');

    async function captureActiveTab() {
        const wins = BrowserWindow.getAllWindows();
        const mainWin = wins.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
        
        if (mainWin) {
            const image = await mainWin.webContents.capturePage();
            const screenshotsDir = pathModule.join(userDataPath, 'archive_thumbnails');
            if (!fsModule.existsSync(screenshotsDir)) fsModule.mkdirSync(screenshotsDir, { recursive: true });

            const fileName = `thumb_${Date.now()}.png`;
            const filePath = pathModule.join(screenshotsDir, fileName);
            
            fsModule.writeFileSync(filePath, image.toPNG());
            return `file://${filePath.replace(/\\/g, '/')}`;
        }
        return null;
    }

    function toggleArchiveWindow(parentWin) {
        if (archiveWin && !archiveWin.isDestroyed()) {
            archiveWin.close();
            return;
        }

        const parentBounds = parentWin.getBounds();
        const width = 800;
        const height = 600;

        const x = Math.round(parentBounds.x + (parentBounds.width - width) / 2);
        const y = Math.round(parentBounds.y + (parentBounds.height - height) / 2);

        archiveWin = new BrowserWindow({
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

        archiveWin.loadFile(pathModule.join(__dirname, 'archive-picker.html'));

        archiveWin.webContents.on('did-finish-load', () => {
            parentWin.webContents.send('request-active-tab-data');
        });

        archiveWin.on('closed', () => {
            archiveWin = null;
        });
    }

    // IPC Обработчики архива
    ipcMain.handle('get-archive-items', async () => {
        if (!fsModule.existsSync(archivePath)) return [];
        try {
            const data = fsModule.readFileSync(archivePath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error("Ошибка чтения архива:", e);
            return [];
        }
    });

    ipcMain.on('save-to-archive-from-picker', async (event, data) => {
        let archive = [];
        if (fsModule.existsSync(archivePath)) {
            try { archive = JSON.parse(fsModule.readFileSync(archivePath, 'utf8')); } catch(e){}
        }
        
        const thumbnail = await captureActiveTab();
        
        archive.push({ 
            id: Date.now(), 
            ...data, 
            thumbnail: thumbnail
        });
        
        fsModule.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
    });

    ipcMain.on('active-tab-data-response', (event, data) => {
        const wins = BrowserWindow.getAllWindows();
        const aWin = wins.find(w => w.webContents.getURL().includes('archive-picker.html'));
        if (aWin && !aWin.isDestroyed()) {
            aWin.webContents.send('active-tab-data-response', data);
        }
    });

    ipcMain.on('delete-from-archive', (event, itemId) => {
        if (!fsModule.existsSync(archivePath)) return;
        try {
            let archive = JSON.parse(fsModule.readFileSync(archivePath, 'utf8'));
            const itemToDelete = archive.find(item => item.id === itemId);
            
            if (itemToDelete && itemToDelete.thumbnail) {
                const screenshotPath = itemToDelete.thumbnail.replace('file://', '');
                const normalizedPath = pathModule.normalize(screenshotPath);

                if (fsModule.existsSync(normalizedPath)) {
                    fsModule.unlinkSync(normalizedPath);
                    console.log(`Система: Файл скриншота удален: ${normalizedPath}`);
                }
            }

            archive = archive.filter(item => item.id !== itemId);
            fsModule.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
        } catch (e) {
            console.error("Ошибка при полном удалении карточки:", e);
        }
    });

    ipcMain.on('rename-in-archive', (event, data) => {
        if (!fsModule.existsSync(archivePath)) return;
        try {
            const id = data.id;
            const title = data.title;
            let archive = JSON.parse(fsModule.readFileSync(archivePath, 'utf8'));
            const item = archive.find(i => i.id == id); 
            
            if (item) {
                item.title = title;
                fsModule.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
                event.reply('rename-success');
            }
        } catch (e) {
            console.error("Ошибка при переименовании в архиве:", e);
        }
    });

    ipcMain.on('change-item-group', (event, data) => {
        if (!fsModule.existsSync(archivePath)) return;
        try {
            const { id, group } = data;
            let archive = JSON.parse(fsModule.readFileSync(archivePath, 'utf8'));
            const item = archive.find(i => i.id == id);
            
            if (item) {
                item.group = group;
                fsModule.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
            }
        } catch (e) { console.error("Ошибка смены группы:", e); }
    });

    ipcMain.on('toggle-archive-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) toggleArchiveWindow(win);
    });

    return { toggleArchiveWindow };
}

module.exports = { setupArchiveService };