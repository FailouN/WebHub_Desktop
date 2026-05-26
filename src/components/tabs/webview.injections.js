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
        // Исправление Fullscreen
        document.addEventListener('fullscreenerror', (e) => {});

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

        // ===================================================
        // УЛЬТИМАТИВНЫЙ МЕНЕДЖЕР ПАРОЛЕЙ (GOOGLE / MAIL.RU / SPA)
        // ===================================================
        (function() {
            let availableAccounts = [];
            let lastFocusedInput = null;

            let manualTypedLogin = '';
            let manualTypedPassword = '';

            const safeStorage = {
                _backup: {},
                setItem: function(key, value) {
                    try {
                        if (typeof sessionStorage !== 'undefined') {
                            sessionStorage.setItem(key, value);
                            return;
                        }
                    } catch(e) {}
                    this._backup[key] = value;
                },
                getItem: function(key) {
                    try {
                        if (typeof sessionStorage !== 'undefined') {
                            return sessionStorage.getItem(key);
                        }
                    } catch(e) {}
                    return this._backup[key] || null;
                },
                removeItem: function(key) {
                    try {
                        if (typeof sessionStorage !== 'undefined') {
                            sessionStorage.removeItem(key);
                            return;
                        }
                    } catch(e) {}
                    delete this._backup[key];
                }
            };

            function getFormPair(relativeInput) {
                if (!relativeInput) return { login: null, password: null };
                
                let inputs = [];
                if (relativeInput.form) {
                    inputs = Array.from(relativeInput.form.querySelectorAll('input'));
                } else {
                    const box = relativeInput.closest('form, div[class*="login"], div[class*="form"], div[class*="auth"]') || relativeInput.parentElement || document;
                    inputs = Array.from(box.querySelectorAll('input'));
                    if (!inputs.some(i => i.type === 'password')) {
                        inputs = Array.from(document.querySelectorAll('input'));
                    }
                }

                const password = inputs.find(i => i.type === 'password' || i.getAttribute('autocomplete') === 'current-password' || i.name?.toLowerCase().includes('password'));
                
                const login = inputs.find(i => i !== password && (
                    i.type === 'email' || 
                    i.type === 'tel' || 
                    i.getAttribute('autocomplete')?.includes('username') ||
                    i.name?.toLowerCase().includes('user') || 
                    i.name?.toLowerCase().includes('login') ||
                    i.id?.toLowerCase().includes('user') || 
                    i.id?.toLowerCase().includes('login') ||
                    (i.type === 'text' && window.getComputedStyle(i).display !== 'none')
                ));

                return { login, password };
            }

            // Отслеживаем то, что пользователь вводит ручками
            document.addEventListener('input', (e) => {
                const target = e.target;
                if (target && target.tagName === 'INPUT') {
                    if (target.type === 'password' || target.getAttribute('autocomplete') === 'current-password') {
                        manualTypedPassword = target.value;
                    } else if (target.type === 'text' || target.type === 'email' || target.type === 'tel' || target.name === 'email' || target.getAttribute('autocomplete')?.includes('username')) {
                        manualTypedLogin = target.value.trim();
                    }
                }
            }, true);

            function safeFillInput(input, value) {
                if (!input) return;
                try {
                    input.focus();
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(input, value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            // Функция перехвата и сборки учетных данных
            function captureCurrentCredentials(triggerElement) {
                const pair = getFormPair(triggerElement || lastFocusedInput);
                
                const currentPassword = pair.password ? pair.password.value : manualTypedPassword;
                let currentLogin = pair.login ? pair.login.value.trim() : manualTypedLogin;

                // ШАГ 1: Если на экране есть только логин (поле пароля отсутствует/скрыто)
                if (!pair.password && currentLogin && !currentPassword) {
                    safeStorage.setItem('webhub_step1_login', currentLogin);
                    return;
                }

                // ШАГ 2: Если мы дошли до пароля, проверяем сохраненный логин из Шага 1
                const savedStep1Login = safeStorage.getItem('webhub_step1_login');
                if (currentPassword && savedStep1Login) {
                    // Если текущий найденный на странице логин пустой или скрыт (как у Google), восстанавливаем его из памяти
                    if (!currentLogin || currentLogin.length < 3 || (pair.login && window.getComputedStyle(pair.login).display === 'none')) {
                        currentLogin = savedStep1Login;
                    }
                }

                // Если собрали полный комплект — отправляем в Electron на сохранение
                if (currentLogin && currentPassword && currentPassword.length > 2) {
                    console.log('WEBVIEW_ACTION:SAVE_CREDS:' + window.location.href + '|||' + currentLogin + '|||' + currentPassword);
                    safeStorage.removeItem('webhub_step1_login');
                    manualTypedLogin = '';
                    manualTypedPassword = '';
                }
            }

            function requestCredentials() {
                console.log('WEBVIEW_ACTION:GET_CREDS:' + window.location.hostname);
            }

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
                        const pair = getFormPair(targetInput);

                        if (pair.login) safeFillInput(pair.login, acc.username);
                        safeStorage.setItem('webhub_step1_login', acc.username);

                        let duration = 0;
                        const passFillInterval = setInterval(() => {
                            duration += 50;
                            const freshPair = getFormPair(targetInput);

                            if (freshPair.password && freshPair.password.value !== acc.password) {
                                safeFillInput(freshPair.password, acc.password);
                            }

                            if (duration >= 1500) clearInterval(passFillInterval);
                        }, 50);

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

            // Отслеживание фокуса для автозаполнения
            document.addEventListener('focusin', (e) => {
                const target = e.target;
                if (target && target.tagName === 'INPUT') {
                    const type = target.type;
                    if (type === 'text' || type === 'email' || type === 'tel' || type === 'password') {
                        lastFocusedInput = target;
                        requestCredentials();
                        setTimeout(() => {
                            if (document.activeElement === target) showVaultDropdown(target);
                        }, 150);
                    }
                }
            }, true);

            document.addEventListener('mousedown', (e) => {
                if (!e.target.classList.contains('webhub-vault-item') && !e.target.classList.contains('webhub-vault-dropdown')) {
                    removeVaultDropdown();
                }
            }, true);

            // ПЕРЕХВАТ КЛИКОВ НА КНОПКИ (Улучшенный под Google/Mail.ru)
            document.addEventListener('mousedown', (e) => {
                const target = e.target;
                if (!target) return;

                // Ищем кнопку вверх по дереву, даже если кликнули на внутренний span с текстом
                const buttonEl = target.closest('button') || 
                                 target.closest('[role="button"]') || 
                                 target.closest('[jsaction*="click"]') ||
                                 (target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button'));

                const isButton = !!buttonEl || target.className?.toString().toLowerCase().includes('button');

                if (isButton) {
                    captureCurrentCredentials(buttonEl || target);
                }
            }, true);

            // Перехват отправки формы через Enter
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                    captureCurrentCredentials(e.target);
                }
            }, true);

            // Обработка ответов от Electron
            window.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'VAULT_FILL_DATA') {
                    availableAccounts = event.data.accounts || [];
                    
                    if (lastFocusedInput && (lastFocusedInput.type === 'password' || lastFocusedInput.name?.toLowerCase().includes('password'))) {
                        const lastLogin = safeStorage.getItem('webhub_step1_login');
                        let matchedAcc = null;

                        if (lastLogin) {
                            matchedAcc = availableAccounts.find(acc => acc.username === lastLogin);
                        } else if (availableAccounts.length === 1) {
                            matchedAcc = availableAccounts[0];
                        }

                        if (matchedAcc) {
                            safeFillInput(lastFocusedInput, matchedAcc.password);
                            return; 
                        }
                    }

                    if (lastFocusedInput && document.activeElement === lastFocusedInput) {
                        showVaultDropdown(lastFocusedInput);
                    }
                }
            });

            requestCredentials();
        })();

        window.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'execute-local-translation') {
                window.dispatchEvent(new CustomEvent('trigger-webhub-translate'));
            }
        });
    `
};