class Tabs extends Component {
    refs = {};

    constructor() {
        super();
        this.tabs = CONFIG.tabs;
        this.openedWindows = []; 
        this.activeWindowId = null;
    }

    imports() {
        return [
            this.resources.icons.material,
            this.resources.icons.tabler,
            this.resources.fonts.roboto,
            this.resources.fonts.raleway,
            this.resources.libs.awoo,
        ];
    }
  
    style() {
        return window.tabsStyles || ''; 
    }

    template() {
        return window.getTabsTemplate(this.tabs);
    }

    handleGlobalKeyDown = (e) => {
        if (e.ctrlKey && e.code === 'KeyD') {
            e.preventDefault();
            const activeFrame = this.shadowRoot.querySelector(`webview[data-id="${this.activeWindowId}"]`);
            if (activeFrame && this.bookmarkService) {
                this.bookmarkService.addBookmark(activeFrame.getURL(), activeFrame.getTitle());
            }
        }
    }

    connectedCallback() {
        this.render();
        window.addEventListener('keydown', this.handleGlobalKeyDown);

        if (window.electronAPI) {
            // 1. Сбор данных для окна архива (кнопка "Отложить")
            window.electronAPI.on('request-active-tab-data', () => {
                const activeFrame = this.shadowRoot.querySelector(`webview[data-id="${this.activeWindowId}"]`);
                if (activeFrame) {
                    const data = {
                        url: activeFrame.getURL(),
                        title: activeFrame.getTitle()
                    };
                    window.electronAPI.send('active-tab-data-response', data);
                }
            });

            // 2. Команда на открытие ссылки из архива
            window.electronAPI.on('force-open-url', (url) => {
                console.log("Система: Получена команда открыть URL из архива:", url);
                if (typeof this.openNewWindow === 'function') {
                    this.openNewWindow(url);
                } else {
                    console.error("Ошибка: Метод openNewWindow не найден!");
                    window.postMessage({ type: 'open-url', url: url }, '*');
                }
            });

            // 3. Обработка полноэкранного режима
            window.electronAPI.on('fullscreen-toggled', (isFullScreen) => {
                if (isFullScreen) {
                    document.body.classList.add('is-fullscreen');
                } else {
                    document.body.classList.remove('is-fullscreen');
                }
            });

            // 4. Подписка на прокси-запросы
            this._unsubscribeProxy = window.electronAPI.on('get-current-domain-for-proxy', () => {
                this.handleProxyRequest();
            });
        }

        // Подписываемся на глобальный триггер перевода (стрелочная функция сохраняет контекст)
        window.addEventListener('trigger-webhub-translate', this.translateActiveWindow);

        // Инициализируем сервисы управления
        this.remoteService = new RemoteControlService(this.shadowRoot);
        this.remoteService.init();

        // Запуск настройки превью с небольшой задержкой для отрисовки DOM
        setTimeout(() => this.setupPreview(), 10);

        this.addEventListener('toggle-archive', () => {
            console.log("Tabs: Получено событие открытия архива от Statusbar");
            if (window.electronAPI) {
                window.electronAPI.send('toggle-archive-window');
            }
        });
    }

    disconnectedCallback() {
        // Очистка сервиса управления
        if (this.remoteService) this.remoteService.destroy();
        
        // Очистка подписок
        if (this._unsubscribeProxy) this._unsubscribeProxy();
        
        window.removeEventListener('keydown', this.handleGlobalKeyDown);
        window.removeEventListener('click', this.closeBookmarksIfClickedOutside);
        window.removeEventListener('trigger-webhub-translate', this.translateActiveWindow);
        
        if (this._previewTimeout) clearTimeout(this._previewTimeout);
    }

    closeBookmarksIfClickedOutside = (e) => {
        const bookmarksMenu = this.shadowRoot.getElementById('bookmarks-menu');
        const bookmarksBtn = this.shadowRoot.getElementById('bookmarks-btn');
        
        if (bookmarksMenu && bookmarksMenu.style.display === 'flex') {
            const path = e.composedPath();
            const isClickInsideMenu = path.includes(bookmarksMenu);
            const isClickInsideBtn = path.includes(bookmarksBtn);

            if (!isClickInsideMenu && !isClickInsideBtn) {
                bookmarksMenu.style.display = 'none';
                
                const ctxMenu = this.shadowRoot.getElementById('bookmark-context-menu');
                if (ctxMenu) ctxMenu.style.display = 'none';
            }
        }
    }

    translateActiveWindow = async () => {
    const activeFrame = this.shadowRoot.querySelector(`webview[data-id="${this.activeWindowId}"]`);
    if (!activeFrame) {
        console.error("Translate: Активное окно webview не найдено.");
        return;
    }

    console.log("Translate: Запуск сбора текста из активного webview...");

    const scriptGatherText = `
        (() => {
            function getTextNodes(node) {
                let textNodes = [];
                if (node.nodeType === Node.TEXT_NODE) {
                    const trimmed = node.nodeValue.trim();
                    if (trimmed.length > 1 && /[a-zA-Z]/.test(trimmed)) {
                        textNodes.push(node);
                    }
                } else {
                    const badTags = [
            'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'NOSCRIPT', 
            'CODE', 'PRE', 'SVG', 'PATH', 'IFRAME', 'OBJECT'
        ];
                    if (!badTags.includes(node.tagName)) {
                        for (let child of node.childNodes) {
                            textNodes.push(...getTextNodes(child));
                        }
                    }
                }
                return textNodes;
            }

            window._webhubTextNodes = getTextNodes(document.body);
            return window._webhubTextNodes.map(node => node.nodeValue);
        })();
    `;

    try {
        const rawTexts = await activeFrame.executeJavaScript(scriptGatherText);
        
        if (!rawTexts || rawTexts.length === 0) {
            console.log("Translate: На странице не найдено подходящего текста для перевода.");
            return;
        }

        console.log(`Translate: Извлечено строк: ${rawTexts.length}. Запускаем стриминг-перевод...`);

        // СЛУШАЕМ ПОТОКОВЫЕ ОТВЕТЫ ОТ MAIN СИСТЕМЫ
        window.electronAPI.onTranslationChunk(async (data) => {
            // ИСПРАВЛЕНИЕ: Проверяем, что фрейм всё еще существует в DOM дереве (isConnected)
            if (!activeFrame || !activeFrame.isConnected) return;

            const scriptApplyChunk = `
                (() => {
                    if (window._webhubTextNodes && window._webhubTextNodes[${data.id}]) {
                        window._webhubTextNodes[${data.id}].nodeValue = ${JSON.stringify(data.translated)};
                    }
                })();
            `;
            
            try {
                await activeFrame.executeJavaScript(scriptApplyChunk);
            } catch (e) {
                // Игнорируем ошибки исполнения, если страница обновилась в процессе
            }
        });

        // Слушаем финал
        window.electronAPI.onTranslationFinal(async (result) => {
            console.log("Translate: Поток перевода завершен.");
            // ИСПРАВЛЕНИЕ: Проверяем через isConnected
            if (!activeFrame || !activeFrame.isConnected) return;
            
            try {
                await activeFrame.executeJavaScript(`delete window._webhubTextNodes;`);
            } catch(e){}
        });

        // Отправляем массив строк в Main-процесс
        window.electronAPI.sendTranslationRequest(rawTexts);

    } catch (err) {
        console.error("Translate: Критическая ошибка в процессе перевода вкладки:", err);
    }
}

    openNewWindow = (url) => {
        const root = this.shadowRoot;
        const fullContainer = root.getElementById('full-container');
        const id = btoa(unescape(encodeURIComponent(url))).slice(-15, -3);

        if (this.openedWindows.find(w => w.id === id)) {
            this.toggleWindow(id);
            return;
        }

        const newFrame = document.createElement('webview');
        newFrame.setAttribute('src', url);
        newFrame.setAttribute('data-id', id);
        newFrame.setAttribute('allowfullscreen', 'true');
        newFrame.setAttribute('useragent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 WebHubSecureSrv_v3");
        newFrame.style.width = '100%';
        newFrame.style.height = '100%';

        newFrame.addEventListener('dom-ready', () => {
            if (typeof HotkeyManager !== 'undefined') {
                newFrame.executeJavaScript(HotkeyManager.getInjectionScript());
            }
            if (typeof WebviewInjections !== 'undefined') {
                newFrame.executeJavaScript(WebviewInjections.getJS());
                newFrame.insertCSS(WebviewInjections.getCSS());
            }
        });

        newFrame.addEventListener('console-message', (e) => {
            const data = e.message;

            if (data === 'WEBVIEW_ACTION:EXTERNAL_CLICK') {
                const bookmarksMenu = this.shadowRoot.getElementById('bookmarks-menu');
                if (bookmarksMenu) bookmarksMenu.style.display = 'none';
                
                const ctxMenu = this.shadowRoot.getElementById('bookmark-context-menu');
                if (ctxMenu) ctxMenu.style.display = 'none';
            }
            
            if (data === 'WEBVIEW_ACTION:SAVE_BOOKMARK') {
                if (this.bookmarkService) {
                    this.bookmarkService.addBookmark(newFrame.getURL(), newFrame.getTitle());
                }
            }

            if (data === 'WEBVIEW_ACTION:GO_BACK' && newFrame.canGoBack()) newFrame.goBack();
            if (data === 'WEBVIEW_ACTION:GO_FORWARD' && newFrame.canGoForward()) newFrame.goForward();
        });

        fullContainer.appendChild(newFrame);
        this.openedWindows.push({ id, url });
        this.toggleWindow(id);
    };

    toggleWindow = (id) => {
        const root = this.shadowRoot;
        const fullWin = root.getElementById('full-window');
        const fullContainer = root.getElementById('full-container');

        if (this.activeWindowId === id) {
            this.activeWindowId = null;
            fullWin.style.display = 'none';
        } else {
            this.activeWindowId = id;
            fullContainer.querySelectorAll('webview').forEach(f => f.style.display = 'none');
            const activeFrame = fullContainer.querySelector(`webview[data-id="${id}"]`);
            if (activeFrame) {
                activeFrame.style.display = 'flex';
                fullWin.style.display = 'flex';
            }
        }
        this.updateTaskbar();
    };

    closeWindow = (id) => {
        const root = this.shadowRoot;
        const wv = root.querySelector(`webview[data-id="${id}"]`);

        if (wv) {
            try {
                wv.stop();
                wv.setUserAgent("");
            } catch (e) {
                console.warn("Webview уже был частично выгружен");
            }
            wv.remove(); 
        }

        this.openedWindows = this.openedWindows.filter(w => w.id !== id);

        if (this.activeWindowId === id) {
            this.activeWindowId = null;
            const fullWin = root.getElementById('full-window');
            if (fullWin) fullWin.style.display = 'none';
        }

        this.updateTaskbar();
    };

    updateTaskbar = () => {
        const root = this.shadowRoot;
        const taskbar = root.getElementById('taskbar');
        if (!taskbar) return;

        taskbar.innerHTML = this.openedWindows.map(win => {
            const domain = new URL(win.url).hostname;
            return `
                <div class="taskbar-item ${this.activeWindowId === win.id ? 'active' : ''}" data-id="${win.id}">
                    <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64">
                    <div class="dot"></div>
                </div>
            `;
        }).join('');

        taskbar.querySelectorAll('.taskbar-item').forEach(el => {
            el.onclick = () => this.toggleWindow(el.dataset.id);
            el.oncontextmenu = (e) => {
                e.preventDefault();
                this.closeWindow(el.dataset.id);
            };
        });
    };

    async handleProxyRequest() {
        const activeWebview = this.shadowRoot.querySelector(`webview[data-id="${this.activeWindowId}"]`) 
                               || this.shadowRoot.querySelector('webview');
        
        if (activeWebview && window.electronAPI) {
            try {
                const url = new URL(activeWebview.getURL());
                const domain = url.hostname;

                if (window.proxyAPI && window.proxyAPI.addDomain) {
                    await window.proxyAPI.addDomain(domain);
                } else {
                    await window.electronAPI.invoke('save-proxy-domain', domain);
                }
                
                console.log(`Домен ${domain} отправлен в прокси`);
            } catch (e) {
                console.error("Ошибка домена:", e);
            }
        }
    }

    setupPreview() {
        const root = this.shadowRoot;
        const panel = root.getElementById('preview-panel');
        const frame = root.getElementById('preview-frame');
        const btnPreview = root.getElementById('close-preview-bar');
        const searchInput = root.querySelector('search-bar');

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const inputVal = e.target.value || (searchInput.shadowRoot && searchInput.shadowRoot.querySelector('input')?.value);
                    const trimInput = inputVal ? inputVal.trim() : "";

                    if (trimInput) {
                        let searchUrl = CONFIG.search.engines.g[0];
                        let query = trimInput;

                        if (trimInput.startsWith('!')) {
                            const parts = trimInput.split(' ');
                            const tag = parts[0].substring(1);
                            if (CONFIG.search.engines[tag]) {
                                searchUrl = CONFIG.search.engines[tag][0];
                                query = parts.slice(1).join(' ');
                            }
                        }
                        this.openNewWindow(searchUrl + encodeURIComponent(query));
                        
                        if (e.target.value !== undefined) e.target.value = '';
                        const innerInput = searchInput.shadowRoot?.querySelector('input');
                        if (innerInput) innerInput.value = '';
                    }
                }
            });
        }

        this.bookmarkService = new BookmarkService(this.shadowRoot, (url) => this.openNewWindow(url));

        const bBtn = this.shadowRoot.getElementById('bookmarks-btn');
        if (bBtn) {
            bBtn.onclick = () => {
                this.bookmarkService.toggleMenu(); 
            };
        }

        root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const path = e.composedPath();
            
            const bookmarkItem = path.find(el => el.classList && el.classList.contains('bookmark-item'));
            if (bookmarkItem) {
                const url = bookmarkItem.dataset.url;
                if (this.bookmarkService && this.bookmarkService.showContextMenu) {
                    this.bookmarkService.showContextMenu(e, url);
                }
                return;
            }

            const link = path.find(el => el.tagName === 'A');
            if (link && !path.some(el => el.id === 'taskbar')) {
                frame.setAttribute('src', link.href);
                panel.style.display = 'flex';
                if (btnPreview) btnPreview.style.display = 'block';
            }
        });

        root.addEventListener('click', (e) => {
            const link = e.composedPath().find(el => el.tagName === 'A');
            if (link && e.button === 0 && !e.composedPath().some(el => el.id === 'taskbar')) {
                e.preventDefault();
                this.openNewWindow(link.href);
            }
        });

        if (btnPreview) {
            btnPreview.onclick = (e) => {
                e.preventDefault();
                panel.style.display = 'none';
                frame.setAttribute('src', 'about:blank');
                btnPreview.style.display = 'none';
            };
        }

        this.addEventListener('open-preview', (e) => {
            const url = e.detail.url;
            frame.setAttribute('src', url);
            panel.style.display = 'flex';
            if (btnPreview) btnPreview.style.display = 'block';
        });

        this.addEventListener('toggle-bookmarks', () => {
            this.bookmarkService.toggleMenu();
        });
    }
}