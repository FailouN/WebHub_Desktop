// src/components/header.component.js

function createHeader() {
    const header = document.createElement('header');
    header.id = 'app-header';

    header.innerHTML = `
        <button id="app-menu-btn" style="margin-right: 10px; cursor: pointer;">
            ☰ Меню
        </button>

        <div class="header-drag-area">
            <div class="header-logo">
                <img
                    src="src/img/logo.ico"
                    width="16"
                    height="16"
                    style="margin-right: 8px;"
                >
                <span>WebHub Desktop</span>
            </div>
        </div>

        <div
            class="header-controls"
            style="display: flex; align-items: center;"
        >
            <button
                id="translate-btn"
                title="Перевести страницу"
                style="
                    margin-right: 15px;
                    cursor: pointer;
                    background: none;
                    border: none;
                    color: inherit;
                    font-size: 14px;
                    transition: color 0.2s ease, opacity 0.2s ease;
                "
            >
                文/А
            </button>

            <button id="min-btn">—</button>
            <button id="max-btn">▢</button>
            <button id="close-btn">✕</button>
        </div>
    `;

    document.body.prepend(header);

    // =====================================================
    // УМНАЯ КНОПКА ПЕРЕВОДА
    // =====================================================
    const translateBtn = document.getElementById('translate-btn');
    
    // Локальное состояние активной вкладки
    let currentTabState = { isActive: false, isProcessing: false };

    const updateButtonUI = () => {
        if (!currentTabState.isActive) {
            // Переводчик ВЫКЛЮЧЕН
            translateBtn.innerText = "文/А";
            translateBtn.style.color = "inherit";
            translateBtn.title = "Включить перевод страницы";
        } else {
            // Переводчик ВКЛЮЧЕН
            translateBtn.style.color = "#4caf50"; // Зеленый цвет
            if (currentTabState.isProcessing) {
                translateBtn.innerText = "⏳ 文/А";
                translateBtn.title = "Выключить перевод (обрабатываются новые элементы...)";
            } else {
                translateBtn.innerText = "✓ 文/А";
                translateBtn.title = "Выключить перевод";
            }
        }
    };

    translateBtn.onclick = () => {
        // Защита от спама кликами (чтобы не запускать 10 раз подряд)
        if (translateBtn.disabled) return;
        
        // Отправляем команду в tabs.component.js
        if (currentTabState.isActive) {
            window.dispatchEvent(new CustomEvent('trigger-webhub-translate-toggle', {
                detail: { action: 'disable' }
            }));
        } else {
            window.dispatchEvent(new CustomEvent('trigger-webhub-translate-toggle', {
                detail: { action: 'enable' }
            }));
        }
    };

    // Слушаем обновления от вкладок
    window.addEventListener('webhub-translate-state-changed', (e) => {
        currentTabState = e.detail || { isActive: false, isProcessing: false };
        updateButtonUI();
    });

    // =====================================================
    // ELECTRON API
    // =====================================================
    if (window.electronAPI) {
        document.getElementById('app-menu-btn').onclick =
            () => window.electronAPI.invoke('show-context-menu');

        document.getElementById('min-btn').onclick =
            () => window.electronAPI.invoke('window-minimize');

        document.getElementById('max-btn').onclick =
            () => window.electronAPI.invoke('window-maximize');

        document.getElementById('close-btn').onclick =
            () => window.electronAPI.invoke('window-close');
    }
}

// =========================================================
// FULLSCREEN EVENT
// =========================================================
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('fullscreen-toggled', (isFullScreen) => {
        if (isFullScreen) {
            document.body.classList.add('fullscreen-mode');
        } else {
            document.body.classList.remove('fullscreen-mode');
        }
    });
}

// =========================================================
// GLOBAL EXPORT
// =========================================================
window.createHeader = createHeader;