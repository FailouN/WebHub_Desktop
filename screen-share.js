const { desktopCapturer, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function setupScreenShare(session) {
    session.setDisplayMediaRequestHandler((request, callback) => {
        // Создаем модальное окно выбора
        let pickerWin = new BrowserWindow({
            width: 800,
            height: 600,
            title: 'Поделиться экраном',
            parent: BrowserWindow.getFocusedWindow(),
            modal: true,
            resizable: false,
            frame: false, // Убираем стандартные рамки для кастомного стиля
            transparent: true, // Включаем прозрачность для эффекта блюра
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        pickerWin.loadFile(path.join(__dirname, 'picker.html'));

        // Получаем источники и отправляем их в окно
        pickerWin.webContents.on('did-finish-load', () => {
            desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 300, height: 300 },
                fetchWindowIcons: true
            }).then(async (sources) => {
                // Фильтрация мусора (ваша логика)
                const filteredSources = sources.filter(source => {
                    const name = source.name.toLowerCase();
                    if (!name || name.trim() === "" || name.includes('.ini')) return false;
                    const junkApps = ['nvidia geforce overlay', 'settings', 'параметры', 'program manager', 'microsoft text input application'];
                    return !junkApps.some(junk => name.includes(junk));
                });

                // Форматируем данные для отправки в UI
                const preparedSources = filteredSources.map(s => ({
                    id: s.id,
                    name: s.name,
                    thumbnail: s.thumbnail.toDataURL(),
                    icon: s.appIcon ? s.appIcon.toDataURL() : null,
                    type: s.id.startsWith('screen') ? 'screen' : 'window'
                }));

                pickerWin.webContents.send('set-sources', preparedSources);
            });
        });

        // Слушаем выбор пользователя
        ipcMain.once('source-selected', (event, sourceId) => {
            if (pickerWin && !pickerWin.isDestroyed()) {
                const source = sourceId ? { id: sourceId } : null; // Если отмена, вернем null
                if (source) {
                    // Находим полный объект источника для передачи обратно
                    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(sources => {
                        const selected = sources.find(s => s.id === sourceId);
                        callback({ 
                            video: selected, 
                            audio: process.platform === 'win32' ? 'loopback' : undefined 
                        });
                    });
                } else {
                    callback(null);
                }
                pickerWin.close();
            }
        });

        pickerWin.on('closed', () => {
            ipcMain.removeAllListeners('source-selected');
            pickerWin = null;
        });
    });
}

module.exports = { setupScreenShare };