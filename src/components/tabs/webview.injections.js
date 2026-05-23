// webview.injections.js

const WebviewInjections = {
    // 1. Все CSS инъекции (Чистый CSS, без JS-кода внутри!)
    getCSS: () => `
        ::-webkit-scrollbar { 
            width: 0px !important; 
            display: none !important; 
        }

        /* Стиль плашки выбора аккаунта */
        .webhub-vault-dropdown {
            position: absolute;
            background: #202124 !important;
            border: 1px solid #3c4043 !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
            z-index: 99999999 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            min-width: 200px;
            max-width: 300px;
            overflow: hidden;
        }

        .webhub-vault-item {
            padding: 10px 14px !important;
            color: #e8eaed !important;
            cursor: pointer !important;
            font-size: 13px !important;
            text-align: left !important;
            transition: background 0.2s !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            overflow: hidden !important;
            border-bottom: 1px solid #2f3134 !important;
        }

        .webhub-vault-item:last-child {
            border-bottom: none !important;
        }

        .webhub-vault-item:hover {
            background: #35363a !important;
        }
        
        .webhub-vault-title {
            padding: 6px 14px !important;
            font-size: 10px !important;
            text-transform: uppercase !important;
            color: #9aa0a6 !important;
            background: #2f3134 !important;
            letter-spacing: 0.5px !important;
        }
    `,

    // 2. Все JS инъекции
    getJS: () => `
        // Исправление Fullscreen (перенесли из CSS в правильное место)
        document.addEventListener('fullscreenerror', (e) => {
            console.error('Fullscreen error caught:', e);
        });

        if (!document.fullscreenEnabled) {
            Object.defineProperty(document, 'fullscreenEnabled', { value: true });
        }

        // Горячие клавиши внутри сайта
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.code === 'KeyD') {
                e.preventDefault();
                console.log('WEBVIEW_ACTION:SAVE_BOOKMARK');
            }
        });

        // Навигация мышью
        window.addEventListener('mouseup', (e) => {
            if (e.button === 3) console.log('WEBVIEW_ACTION:GO_BACK');
            if (e.button === 4) console.log('WEBVIEW_ACTION:GO_FORWARD');
        });

        // Клик вовне (для закрытия меню)
        window.addEventListener('mousedown', () => {
            console.log('WEBVIEW_ACTION:EXTERNAL_CLICK');
        });

        // ==========================================
        // МЕНЕДЖЕР ПАРОЛЕЙ (УМНЫЙ ПОШАГОВЫЙ ПЕРЕХВАТ)
        // ==========================================
        (function() {
            let availableAccounts = []; 

            function initVault() {
                const passwordInput = document.querySelector('input[type="password"]');
                
                // Ищем любое потенциальное поле логина на текущем экране
                const inputs = Array.from(document.querySelectorAll('input'));
                let loginInput = inputs.find(i => i.type === 'text' || i.type === 'email' || i.type === 'tel');

                // Запрашиваем существующие пароли для этого сайта у Main процесса
                console.log('WEBVIEW_ACTION:GET_CREDS:' + window.location.hostname);

                // --- СЦЕНАРИЙ 1: МЫ НА СТРАНИЦЕ ВВОДА ЛОГИНА (Шаг 1) ---
                if (loginInput && !passwordInput) {
                    const loginForm = loginInput.closest('form');
                    const saveCurrentLogin = () => {
                        if (loginInput && loginInput.value.trim()) {
                            sessionStorage.setItem('webhub_temp_login', loginInput.value.trim());
                        }
                    };

                    if (loginForm) {
                        loginForm.addEventListener('submit', saveCurrentLogin);
                    }
                    loginInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') saveCurrentLogin();
                    });
                    
                    loginInput.addEventListener('focus', () => showVaultDropdown(loginInput));
                    loginInput.addEventListener('click', () => showVaultDropdown(loginInput));
                }

                // --- СЦЕНАРИЙ 2: МЫ НА СТРАНИЦЕ ВВОДА ПАРОЛЯ (Шаг 2) ---
                if (passwordInput) {
                    if (!loginInput || !loginInput.value.trim()) {
                        const tempLogin = sessionStorage.getItem('webhub_temp_login');
                        if (tempLogin) {
                            loginInput = { value: tempLogin };
                        }
                    }

                    passwordInput.addEventListener('focus', () => showVaultDropdown(passwordInput));
                    passwordInput.addEventListener('click', () => showVaultDropdown(passwordInput));

                    const passForm = passwordInput.closest('form') || document;
                    
                    const handlePasswordSubmit = () => {
                        const u = loginInput ? loginInput.value.trim() : '';
                        const p = passwordInput.value;
                        if (!u || !p) return;

                        console.log('WEBVIEW_ACTION:SAVE_CREDS:' + window.location.href + '|||' + u + '|||' + p);
                        sessionStorage.removeItem('webhub_temp_login');
                    };

                    if (passForm && passForm.tagName === 'FORM') {
                        passForm.addEventListener('submit', handlePasswordSubmit);
                    } else {
                        passwordInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') handlePasswordSubmit();
                        });
                    }
                }

                // --- ФУНКЦИИ ИНТЕРФЕЙСА ПЛАШКИ ---
                function showVaultDropdown(targetInput) {
                    removeVaultDropdown();
                    if (!availableAccounts || availableAccounts.length === 0) return;

                    const dropdown = document.createElement('div');
                    dropdown.className = 'webhub-vault-dropdown';

                    const title = document.createElement('div');
                    title.className = 'webhub-vault-title';
                    title.innerText = 'Выберите аккаунт';
                    dropdown.appendChild(title);

                    availableAccounts.forEach(acc => {
                        const item = document.createElement('div');
                        item.className = 'webhub-vault-item';
                        item.innerText = acc.username;

                        item.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            
                            const currentRealLogin = document.querySelector('input[type="text"], input[type="email"], input[type="tel"]');
                            if (currentRealLogin) {
                                currentRealLogin.value = acc.username;
                                currentRealLogin.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            
                            sessionStorage.setItem('webhub_temp_login', acc.username);

                            if (passwordInput) {
                                passwordInput.value = acc.password;
                                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                            removeVaultDropdown();
                        });

                        dropdown.appendChild(item);
                    });

                    document.body.appendChild(dropdown);

                    const rect = targetInput.getBoundingClientRect();
                    dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
                    dropdown.style.left = (rect.left + window.scrollX) + 'px';
                    dropdown.style.width = rect.width + 'px';
                }

                function removeVaultDropdown() {
                    const oldContainer = document.querySelector('.webhub-vault-dropdown');
                    if (oldContainer) oldContainer.remove();
                }

                document.addEventListener('mousedown', (e) => {
                    if (!e.target.classList.contains('webhub-vault-item')) {
                        removeVaultDropdown();
                    }
                });
            }

            window.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'VAULT_FILL_DATA') {
                    availableAccounts = event.data.accounts || [];
                }
            });

            const observer = new MutationObserver(() => {
                const hasPass = document.querySelector('input[type="password"]');
                const hasLog = document.querySelector('input[type="text"], input[type="email"], input[type="tel"]');
                if (hasPass || hasLog) {
                    clearTimeout(window.vaultTimeout);
                    window.vaultTimeout = setTimeout(initVault, 300);
                }
            });

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initVault);
            } else {
                initVault();
            }
            setTimeout(initVault, 1000);
        })();

        // =======================================================
        // ТРИГГЕР ЛОКАЛЬНОГО ПЕРЕВОДА СТРАНИЦЫ ДЛЯ TABS.COMPONENT
        // =======================================================
        window.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'execute-local-translation') {
                console.log("Webview Injection: Получен внешний сигнал. Вызываем триггер для Tabs Component...");
                window.dispatchEvent(new CustomEvent('trigger-webhub-translate'));
            }
        });
    `
};