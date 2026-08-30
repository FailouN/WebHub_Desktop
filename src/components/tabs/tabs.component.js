class Tabs extends Component {
    refs = {};

    constructor() {
        super();
        this.tabs = CONFIG.tabs;
        this.openedWindows = []; 
        this.activeWindowId = null;
        this.tabResources = {};
        
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
        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;

window.addEventListener('mousemove', (e) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
});
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
        window.addEventListener('trigger-webhub-translate-toggle', this.translateActiveWindow);

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
        window.removeEventListener('trigger-webhub-translate-toggle', this.translateActiveWindow);
        
        if (this._previewTimeout) clearTimeout(this._previewTimeout);
    }

    cleanupTab(tabId) {
    const resources = this.tabResources[tabId];
    if (!resources) return;

    const { frame, consoleHandler, navHandler } = resources;

    // 1. Отключаем обработчики, если они есть
    if (frame && consoleHandler) frame.removeEventListener('console-message', consoleHandler);
    if (frame && navHandler) frame.removeEventListener('did-navigate', navHandler);

    // 2. Останавливаем скрипты внутри WebView
    frame.executeJavaScript(`
        if (window._webhubTranslationObserver) window._webhubTranslationObserver.disconnect();
        if (window._webhubThrottleTimer) clearTimeout(window._webhubThrottleTimer);
        window._webhubTranslationInitialized = false;
    `).catch(() => {});

    // 3. Чистим локальные ссылки
    delete this.tabResources[tabId];
    console.log(`Система: Ресурсы для вкладки ${tabId} очищены.`);
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

    translateActiveWindow = async (e) => {
    const currentTabId = this.activeWindowId;
    const activeFrame = this.shadowRoot.querySelector(`webview[data-id="${currentTabId}"]`);

    if (!activeFrame) {
        console.error("Translate: Активное окно webview не найдено.");
        return;
    }

    const action = e?.detail?.action || 'enable';

    // Инициализируем хранилища, если они не созданы
    this.translationStates = this.translationStates || {};
    this._translationBatches = this._translationBatches || {};
    this.tabResources = this.tabResources || {}; // Новое хранилище для ресурсов

    // ==========================================
    // ЛОГИКА ВЫКЛЮЧЕНИЯ
    // ==========================================
    if (action === 'disable') {
        this.cleanupTab(currentTabId); // Чистим всё через метод очистки
        
        this.translationStates[currentTabId] = false;
        if (window.electronAPI) window.electronAPI.send('kill-translator-for-tab', currentTabId);
        
        window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
            detail: { isActive: false, isProcessing: false }
        }));
        return;
    }

    // ==========================================
    // ЛОГИКА ВКЛЮЧЕНИЯ
    // ==========================================
    this.cleanupTab(currentTabId); // Очищаем перед новым запуском (защита от дублей)
    this.translationStates[currentTabId] = true;

    // Инициализируем ресурсы вкладки
    this.tabResources[currentTabId] = { frame: activeFrame };

    // Глобальный слушатель чанков (один на всё приложение)
    if (!this._isGlobalChunkListenerSetup) {
        window.electronAPI.onTranslationChunk((data) => {
            const batches = this._translationBatches[data.tabId];
            if (!batches || batches.length === 0) return;
            const currentBatch = batches[0];
            const realId = currentBatch.startIndex + data.id;
            const frame = this.shadowRoot.querySelector(`webview[data-id="${data.tabId}"]`);
            if (!frame || !frame.isConnected) return;

            frame.executeJavaScript(`
                if (window._webhubTextNodes && window._webhubTextNodes[${realId}]) {
                    const node = window._webhubTextNodes[${realId}];
                    node._webhubTranslated = true;
                    node.nodeValue = ${JSON.stringify(data.translated)};
                }
            `).catch(() => {});

            currentBatch.receivedCount++;
            if (currentBatch.receivedCount >= currentBatch.expectedCount) {
                batches.shift();
                window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
                    detail: { isActive: true, isProcessing: batches.length > 0 }
                }));
            }
        });
        this._isGlobalChunkListenerSetup = true;
    }

    // Обработчик консоли
    const consoleHandler = (e) => {
        if (e.message.startsWith('WEBVIEW_ACTION:DYNAMIC_TRANSLATE:')) {
            const { startIndex, texts } = JSON.parse(e.message.replace('WEBVIEW_ACTION:DYNAMIC_TRANSLATE:', ''));
            this._translationBatches[currentTabId] = this._translationBatches[currentTabId] || [];
            this._translationBatches[currentTabId].push({ startIndex, expectedCount: texts.length, receivedCount: 0 });
            
            window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
                detail: { isActive: true, isProcessing: true }
            }));
            window.electronAPI.sendTranslationRequest({ tabId: currentTabId, textArray: texts });
        }
    };
    
    // Сохраняем обработчик для возможности удаления
    this.tabResources[currentTabId].consoleHandler = consoleHandler;
    activeFrame.addEventListener('console-message', consoleHandler);

    // Инъекция скрипта
    const injectionScript = `
            (() => {
                if (window._webhubTranslationInitialized) {
                    console.log("Автопереводчик на этой странице уже активен.");
                    return;
                }
                window._webhubTranslationInitialized = true;
                window._webhubTextNodes = [];
                window._webhubMutationQueue = [];
                window._webhubThrottleTimer = null;

                function extractTextNodes(node) {
                    let textNodes = [];
                    if (node.nodeType === Node.TEXT_NODE) {
                        const trimmed = node.nodeValue.trim();
                        if (trimmed.length > 1 && /[a-zA-Z]/.test(trimmed) && !node._webhubTranslated) {
                            textNodes.push(node);
                        }
                    } else {
                        const badTags = ['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'IFRAME', 'OBJECT'];
                        if (!badTags.includes(node.tagName)) {
                            for (let child of node.childNodes) {
                                textNodes.push(...extractTextNodes(child));
                            }
                        }
                    }
                    return textNodes;
                }

                function sendBatch(nodes) {
                    if (nodes.length === 0) return;
                    const startIndex = window._webhubTextNodes.length;
                    const textsToSend = [];

                    nodes.forEach(node => {
                        window._webhubTextNodes.push(node);
                        textsToSend.push(node.nodeValue);
                    });

                    console.log("WEBVIEW_ACTION:DYNAMIC_TRANSLATE:" + JSON.stringify({
                        startIndex: startIndex,
                        texts: textsToSend
                    }));
                }

                function queueAndProcessNodes(nodes) {
                    for (let node of nodes) {
                        if (!window._webhubMutationQueue.includes(node)) {
                            window._webhubMutationQueue.push(node);
                        }
                    }

                    while (window._webhubMutationQueue.length >= 64) {
                        const chunk = window._webhubMutationQueue.splice(0, 64);
                        sendBatch(chunk);
                    }

                    if (window._webhubMutationQueue.length > 0) {
                        if (window._webhubThrottleTimer) clearTimeout(window._webhubThrottleTimer);
                        window._webhubThrottleTimer = setTimeout(() => {
                            if (window._webhubMutationQueue.length > 0) {
                                sendBatch(window._webhubMutationQueue);
                                window._webhubMutationQueue = [];
                            }
                        }, 100);
                    }
                }

                const initialNodes = extractTextNodes(document.body);
                if (initialNodes.length > 0) {
                    queueAndProcessNodes(initialNodes);
                }

                // ИСПРАВЛЕНИЕ 1: Теперь обсервер сохраняется в window._webhubTranslationObserver
                window._webhubTranslationObserver = new MutationObserver((mutations) => {
                    let discoveredNodes = [];

                    for (let mutation of mutations) {
                        if (mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                discoveredNodes.push(...extractTextNodes(node));
                            });
                        } else if (mutation.type === 'characterData') {
                            const node = mutation.target;
                            if (node._webhubTranslated) continue; 

                            const trimmed = node.nodeValue.trim();
                            if (trimmed.length > 1 && /[a-zA-Z]/.test(trimmed)) {
                                discoveredNodes.push(node);
                            }
                        }
                    }

                    if (discoveredNodes.length > 0) {
                        queueAndProcessNodes(discoveredNodes);
                    }
                });

                window._webhubTranslationObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            })();
        `;

    
    try {
        await activeFrame.executeJavaScript(injectionScript);
    } catch (err) {
        console.error("Ошибка инициализации:", err);
    }

    // Слушатель навигации
    const navHandler = () => {
        if (!this.translationStates[currentTabId]) return;
        setTimeout(async () => {
            if (activeFrame.isConnected) await activeFrame.executeJavaScript(injectionScript).catch(() => {});
        }, 400);
    };
    this.tabResources[currentTabId].navHandler = navHandler;
    activeFrame.addEventListener('did-navigate', navHandler);

    window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
        detail: { isActive: true, isProcessing: false }
    }));
};

    openNewWindow = (url) => {
    const root = this.shadowRoot;
    const fullContainer = root.getElementById('full-container');
    const fullWin = root.getElementById('full-window');
    const id = btoa(unescape(encodeURIComponent(url))).slice(-15, -3);

    if (this.openedWindows.find(w => w.id === id)) {
        this.toggleWindow(id);
        return;
    }

    const newFrame = document.createElement('webview');

    // Настройки webview
    newFrame.setAttribute('src', url);
    newFrame.setAttribute('data-id', id);
    newFrame.setAttribute('allowfullscreen', 'true');
    newFrame.setAttribute('allowpopups', 'true'); 
    newFrame.setAttribute('useragent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.22 Safari/537.36 WebHub/4.0.0");
    newFrame.style.width = '100%';
    newFrame.style.height = '100%';

    // Точный расчет точки вылета курсора
    const winTop = fullWin ? fullWin.offsetTop : 32;
const originX = this.mouseX ?? (window.innerWidth / 2);
const originY = (this.mouseY ?? (window.innerHeight / 2)) - winTop;

// Прописываем origin непосредственно в webview
newFrame.style.setProperty('--spawn-x', `${originX}px`);
newFrame.style.setProperty('--spawn-y', `${originY}px`);
newFrame.style.transformOrigin = `${originX}px ${originY}px`;

    // Вешаем слушатели событий до вставки в DOM
    newFrame.addEventListener('dom-ready', () => {
        if (typeof HotkeyManager !== 'undefined') {
            newFrame.executeJavaScript(HotkeyManager.getInjectionScript());
        }
        if (typeof WebviewInjections !== 'undefined') {
            newFrame.executeJavaScript(WebviewInjections.getJS());
            newFrame.insertCSS(WebviewInjections.getCSS());
        }
    });

    newFrame.addEventListener('did-finish-load', () => {
        this.captureTabPreview(id);
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

    newFrame.addEventListener('new-window', (e) => {
        e.preventDefault();
        const targetUrl = e.url;
        if (targetUrl && targetUrl !== 'about:blank') {
            this.openNewWindow(targetUrl);
        }
    });

    newFrame.addEventListener('did-create-window', (e) => {
        const popupWindow = e.detail?.window || e.window; 
        const popupUrl = e.detail?.options?.url || e.options?.url;

        if (popupUrl && popupUrl !== 'about:blank') {
            this.openNewWindow(popupUrl);
        }

        if (popupWindow && typeof popupWindow.close === 'function') {
            popupWindow.close();
        }
    });

    // Очистка спавн-класса после завершения CSS-анимации
    newFrame.addEventListener('animationend', () => {
        newFrame.classList.remove('is-spawning');
    }, { once: true });

    // Добавляем в DOM и обновляем список открытых окон
    fullContainer.appendChild(newFrame);
    this.openedWindows.push({ id, url });

    // Принудительный Reflow: заставляет браузер зарегистрировать начальное состояние элемента перед анимацией
    void newFrame.offsetWidth;

    // Задаем класс анимации и передаем рассчитанный origin в activateTab
    newFrame.classList.add('is-spawning');
    this.activateTab(id, { x: originX, y: originY });
};

    
     // 1. Метод снятия скриншота активной вкладки
captureTabPreview = async (id) => {
    const root = this.shadowRoot;
    const wv = root?.querySelector(`webview[data-id="${id}"]`);

    // 1. Проверка существования, наличия в DOM и статуса процесса Chromium
    if (!wv || !root.contains(wv) || (typeof wv.isCrashed === 'function' && wv.isCrashed())) {
        return;
    }

    // 2. Защита от клик-спама: игнорируем повторный вызов, если снятие кадра для этого ID уже выполняется
    this._capturingIds = this._capturingIds || new Set();
    if (this._capturingIds.has(id)) return;

    this._capturingIds.add(id);

    try {
        // 3. Проверяем готовность webContentsId до отправки IPC-сообщения в Viz-процесс
        if (typeof wv.getWebContentsId === 'function' && !wv.getWebContentsId()) {
            return;
        }

        const nativeImage = await wv.capturePage();

        // 4. Если за время ожидания ответа IPC элемент успели удалить из DOM — отменяем запись
        if (!root.contains(wv) || !nativeImage || nativeImage.isEmpty()) {
            return;
        }

        this.tabPreviews = this.tabPreviews || {};

        // 5. Оптимизация памяти: даунскейлим NativeImage до 340px (согласно ширине тултипа в CSS).
        // Уменьшает размер base64-строки в 5-10 раз и разгружает сборщик мусора V8 на 165 Гц мониках.
        const resizedImage = nativeImage.resize({ width: 340 });
        this.tabPreviews[id] = resizedImage.toDataURL();

    } catch (e) {
        // Перехватываем ошибки отмены IPC без вылета приложения
        console.warn("Пропуск скриншота (Viz process занят или переключен):", e?.message || e);
    } finally {
        // Снимаем блокировку таба при любом исходе
        this._capturingIds.delete(id);
    }
};

// 2. Показ карточки-превью
showPreview = (id, targetIcon) => {
    const root = this.shadowRoot;
    let previewBox = root.getElementById('tab-preview-tooltip');

    // Если всплывашки еще нет в DOM, создаем ее
    if (!previewBox) {
        previewBox = document.createElement('div');
        previewBox.id = 'tab-preview-tooltip';
        previewBox.innerHTML = `
            <div class="preview-title"></div>
            <div class="preview-body"><img src="" /></div>
        `;
        root.appendChild(previewBox);
    }

    const titleEl = previewBox.querySelector('.preview-title');
    const imgEl = previewBox.querySelector('img');

    // Берем название прямо из webview, чтобы не выводить URL
    const wv = root.querySelector(`webview[data-id="${id}"]`);
    const pageTitle = wv ? wv.getTitle() : '';

    // Отображаем только заголовок (без фоллбэка на URL)
    titleEl.textContent = pageTitle || 'Вкладка';
    imgEl.src = (this.tabPreviews && this.tabPreviews[id]) || '';

    // Позиционируем ровно над иконкой в таскбаре
    const iconRect = targetIcon.getBoundingClientRect();
    const left = iconRect.left + (iconRect.width / 2);

    previewBox.style.left = `${left}px`;
    previewBox.classList.add('visible');
};
// 3. Скрытие карточки
hidePreview = () => {
    const root = this.shadowRoot;
    const previewBox = root.getElementById('tab-preview-tooltip');
    if (previewBox) {
        previewBox.classList.remove('visible');
    }
};

    // Вспомогательный метод: центролизованно управляет классами видимости
activateTab = async (id, customOrigin = null) => {
    if (this.activeWindowId && this.activeWindowId !== id) {
        await this.captureTabPreview(this.activeWindowId);
    }
    const root = this.shadowRoot;
    const fullWin = root.getElementById('full-window');
    const fullContainer = root.getElementById('full-container');

    const targetTabId = id || this.activeWindowId;
    const targetIcon = targetTabId ? root.querySelector(`.taskbar-item[data-id="${targetTabId}"]`) : null;

    if (fullWin) {
        if (customOrigin) {
            // Если координаты переданы напрямую (при спавне нового окна)
            fullWin.style.transformOrigin = `${customOrigin.x}px ${customOrigin.y}px`;
        } else if (targetIcon) {
            // Если переключаем существующую вкладку по клику на иконку
            const iconRect = targetIcon.getBoundingClientRect();
            const winTop = fullWin.offsetTop || 32;
            const originX = iconRect.left + (iconRect.width / 2);
            const originY = iconRect.top + (iconRect.height / 2) - winTop;

            fullWin.style.transformOrigin = `${originX}px ${originY}px`;
        }
    }

    if (id) {
        this.activeWindowId = id;
        const activeIdx = this.openedWindows.findIndex(w => w.id === id);

        if (fullContainer) {
            fullContainer.querySelectorAll('webview').forEach(wv => {
                const wvIdx = this.openedWindows.findIndex(w => w.id === wv.dataset.id);

                wv.classList.remove('active-wv', 'slide-left', 'slide-right');

                if (wvIdx === activeIdx) {
                    wv.classList.add('active-wv');
                } else if (wvIdx < activeIdx) {
                    wv.classList.add('slide-left');
                } else {
                    wv.classList.add('slide-right');
                }
            });
        }

        if (fullWin) {
            fullWin.classList.add('is-open');
        }
    } else {
        this.activeWindowId = null;

        if (fullContainer) {
            fullContainer.querySelectorAll('webview').forEach(wv => {
                wv.classList.remove('active-wv');
            });
        }

        if (fullWin) {
            fullWin.classList.remove('is-open');
        }
    }

    this.updateTaskbar();
};

toggleWindow = (id) => {
    if (this.activeWindowId === id) {
        // Если кликнули по уже активной вкладке — сворачиваем
        this.activateTab(null);
    } else {
        // Иначе активируем нужную вкладку
        this.activateTab(id);
    }

    // Инициализируем состояние перевода
    this.translationStates = this.translationStates || {};
    const isTranslated = !!this.translationStates[id];

    // Оповещаем UI о состоянии перевода
    window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
        bubbles: true,
        composed: true,
        detail: { 
            isActive: this.activeWindowId ? isTranslated : false, 
            isProcessing: false 
        }
    }));
};

closeWindow = (id) => {
    this.cleanupTab(id);
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

    if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('kill-translator-for-tab', id);
    }

    this.openedWindows = this.openedWindows.filter(w => w.id !== id);

    if (this.activeWindowId === id) {
        // Если закрыли текущее активное окно — сворачиваем панель
        this.activateTab(null);

        // Оповещаем UI, что окно закрыто и перевод выключен
        window.dispatchEvent(new CustomEvent('webhub-translate-state-changed', {
            bubbles: true,
            composed: true,
            detail: { isActive: false, isProcessing: false }
        }));
    } else {
        this.updateTaskbar();
    }
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
    const id = el.dataset.id; 

    el.onclick = () => {
        if (this._previewTimeout) clearTimeout(this._previewTimeout);
        this.hidePreview();
        this.toggleWindow(id);
    };

    el.oncontextmenu = (e) => {
        e.preventDefault();
        if (this._previewTimeout) clearTimeout(this._previewTimeout);
        this.hidePreview();
        this.closeWindow(id);
    };

    el.onmouseenter = () => {
        const currentId = el.dataset.id;
        
        // Очищаем предыдущий таймер, если он был запущен
        if (this._previewTimeout) clearTimeout(this._previewTimeout);

        if (currentId && currentId !== this.activeWindowId) {
            // Запускаем показ превью через 0.600 миллисекунд (0.6 секунды)
            this._previewTimeout = setTimeout(() => {
                this.showPreview(currentId, el);
            }, 600);
        }
    };
    
    el.onmouseleave = () => {
        // Если увели курсор раньше 1 секунды — отменяем запуск
        if (this._previewTimeout) clearTimeout(this._previewTimeout);
        this.hidePreview();
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