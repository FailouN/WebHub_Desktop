window.tabsStyles = `
    #links {
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    position: relative;
    overflow: hidden;
    display: block; /* Чтобы он вел себя как полноценный контейнер */
    }
 
 #tab-preview-tooltip {
    position: absolute;
    bottom: 50px;
    transform: translateX(-50%);
    background: rgba(20, 20, 25, 0.9);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    display: none;
    flex-direction: column;
    gap: 6px;
    z-index: 9999;
    pointer-events: none;
    width: 340px; /* Уменьшенная ширина */
}

#tab-preview-tooltip.visible {
    display: flex;
}

#tab-preview-tooltip .preview-title {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
}

#tab-preview-tooltip .preview-body img {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9; /* Пропорции 16:9 */
    object-fit: cover;
    border-radius: 4px;
    background: #111;
    display: block;
}

  #full-window {
    display: flex;
    position: fixed;
    top: var(--win-top, 32px); 
    left: 0px;
    right: 0px;
    bottom: 60px; 
    
    background: #1a1b26;
    border-radius: 0 0 15px 15px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    z-index: 5000;
    flex-direction: column;
    overflow: hidden;

    will-change: transform, opacity, filter;

    /* Свернутое состояние (Genie Effect): окно сжато в миниатюрную полоску с подсветкой */
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: scale(0.02, 0.08) translateY(20px);
    filter: brightness(1.5) saturate(1.3);

    /* Агрессивная нелинейная кривая для эффекта "всасывания" */
    transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.22s ease-in,
                filter 0.38s ease-out,
                visibility 0.38s step-end,
                top 0.2s ease, 
                bottom 0.2s ease,
                border-radius 0.35s ease;
}

/* Развернутое окно */
#full-window.is-open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: scale(1, 1) translateY(0);
    filter: brightness(1) saturate(1);

    /* Пружинящий вылет из иконки (создаёт эффект выплёскивания) */
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
                opacity 0.5s ease-out,
                filter 0.5s ease-in,
                visibility 0s step-start,
                top 0.3s ease, 
                bottom 0.3s ease,
                border-radius 0.5s ease;
}

#full-container webview {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    will-change: transform, opacity;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
                opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: scale(0.97);
}

/* Базовое состояние свайпа */
#full-container webview {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    will-change: transform, opacity;
    
    /* step-end держит visibility: visible во время анимации ухода вкладки */
    transition: transform 0.70s cubic-bezier(0.16, 1, 0.3, 1),
                opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
                visibility 0.70s step-end;
                
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(100%); /* По умолчанию за правым краем */
}

/* Вкладки, находящиеся ЛЕВЕЕ активной */
#full-container webview.slide-left {
    transform: translateX(-100%);
}

/* Вкладки, находящиеся ПРАВЕЕ активной */
#full-container webview.slide-right {
    transform: translateX(100%);
}

/* АКТИВНАЯ вкладка (по центру) */
#full-container webview.active-wv {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0);
    
    /* step-start включает visibility мгновенно при появлении */
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                visibility 0s step-start;
}

#full-container webview.is-spawning {
    transition: none !important;
    /* Точка старта вылета берется из координат курсора */
    transform-origin: var(--spawn-x, center) var(--spawn-y, center);
    animation: wvExpandFromCursor 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
}

@keyframes wvExpandFromCursor {
    0% {
        opacity: 0;
        /* Стартовый размер ~10px относительно полноэкранного окна */
        transform: scale(0.01);
        filter: blur(10px);
    }
    30% {
        /* Прозрачность уходит быстро, чтобы точку 10px было видно сразу */
        opacity: 1;
    }
    100% {
        opacity: 1;
        transform: scale(1);
        filter: blur(0px);
    }
}

:host-context(body.is-fullscreen) #full-window {
    --win-top: 0px !important;
    top: 0px !important;       /* Принудительно дублируем для надежности */
    bottom: 60px !important;
    border-radius: 0 0 15px 15px !important;
}

/* На всякий случай добавим обычный селектор для совместимости */
body.is-fullscreen #full-window {
    --win-top: 0px !important;
    top: 0px !important;
    bottom: 60px !important;
    border-radius: 0 0 15px 15px !important;
}

#full-frame {
    width: 100%;
    height: 100%;
}

status-bar {
    position: fixed;
    bottom: 15px;
    left: 0;
    right: 0;
    margin-left: 20px !important;
    margin-right: 20px !important;
    width: auto !important; 
    height: 38px;
    
    /* ЭТО КЛЮЧЕВОЕ: */
    background: rgba(40, 40, 40, 0.4) !important; 
    backdrop-filter: blur(12px) saturate(160%);
    -webkit-backdrop-filter: blur(12px) saturate(160%);

    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 9998;
    box-sizing: border-box;
    overflow: hidden;
}

#taskbar {
    position: fixed;
    bottom: 15px; /* Та же высота, что у бара */
    left: 50%;
    transform: translateX(-50%);
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    z-index: 10000; /* Поверх всего */
    pointer-events: none; /* Пропускаем клики сквозь контейнер */
}

.taskbar-item {
    pointer-events: auto; /* А вот по самим иконкам кликать можно */
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: rgba(255,255,255, 0.05);
    border-radius: 8px;
    transition: all 0.2s;
}

.taskbar-item img {
    width: 22px;
    height: 22px;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}
.taskbar-item:hover {
    transform: scale(1.1);
}


.taskbar-item .dot {
    position: absolute;
    bottom: -2px;
    width: 4px;
    height: 4px;
    background: #7daea3; /* Цвет индикатора активного окна */
    border-radius: 50%;
    display: none;
}

.taskbar-item.active .dot {
    display: block;
    width: 12px;
    border-radius: 2px;
}

 /* Кнопка закрытия в статус-баре */

.global-btn {

    position: fixed;

    bottom: 21px; /* Центровка по вертикали относительно бара */
    
    height: 38px;
    cursor: pointer;

    font: 700 10px 'Raleway', sans-serif;

    letter-spacing: 1.5px;

    text-transform: uppercase;

    padding: 6px 20px;

    border-radius: 8px;

    z-index: 10000;

    transition: all 0.2s ease;

    backdrop-filter: blur(4px);

} 


/* Кнопка превью — слева (под окном превью) */
#close-preview-bar {
    position: fixed;
    /* Размещаем над статус-баром: 15px (отступ) + 38px (высота бара) + 12px (зазор) = 65px */
    bottom: 15px; 
    
    /* Центрируем относительно панели превью (она у нас 380px) */
    left: 320px; 
    transform: translateX(-50%);
    height: 38px;
    
    /* Ограничиваем размер, чтобы она не была на весь экран */
    width: auto;
    min-width: 150px;
    padding: 8px 16px;
    
    /* Оформление */
    color: #f7768e;
    background: rgba(247, 118, 142, 0.15);
    border: 1px solid rgba(247, 118, 142, 0.4);
    border-radius: 8px;
    backdrop-filter: blur(10px);
    
    font: 700 11px 'Raleway', sans-serif;
    letter-spacing: 1px;
    text-align: center;
    cursor: pointer;
    z-index: 10001; /* Поверх всего */
    transition: all 0.2s ease;
}

#close-preview-bar:hover {
    background: rgba(247, 118, 142, 0.3);
    border-color: #f7768e;
    box-shadow: 0 4px 15px rgba(247, 118, 142, 0.2);
}

.global-btn:hover {
    background: #ff5555;
    color: #fff;
    box-shadow: 0 0 15px rgba(255, 85, 85, 0.4);
}


.taskbar-item {
    width: 34px;
    height: 34px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease;
}

.taskbar-item:hover {
    transform: scale(1.1);
}

.taskbar-item img {
    width: 24px;
    height: 24px;
}

/* Сама точка индикатор */
.taskbar-item .dot {
    width: 4px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    position: absolute;
    bottom: -2px;
    transition: all 0.3s ease;
}

/* Когда окно активно, точка превращается в полоску */
.taskbar-item.active .dot {
    background: #7daea3; 
    width: 12px;
    border-radius: 4px;
}

      #panels, #panels ul,
      #panels .links {
          position: absolute;
      }

      .nav {
          color: #fff;
      }

      #panels {
          border-radius: 15px;
          /* Устанавливаем 16:9 на основе ширины */
          width: 70%; 
          height: 70%;
          right: 0;
          left: 0;
          top: 0;
          bottom: 0;
          margin: auto;
          position: center;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
          background: #282828;
          overflow: hidden;
          }

      .categories .banner {
    position: absolute;
    left: 0;
    top: 0;
    width: 380px; /* Фиксированная ширина левой части */
    height: 100%;
    z-index: 2;
}

      .categories ul {
    --panelbg: transparent;
    --flavour: var(--accent);
    width: 100%;
    height: 100%;
    right: 100%;
    background: #282828; /* Чистый фон */
    transition: all .6s;
    position: absolute;
}

      @keyframes scroll {
          50% {
              background-position-x: -240px;
          }
      }

      .categories ul:nth-child(2) {
          --flavour: #e78a4e;
      }

      .categories ul:nth-child(3) {
          --flavour: #ea6962;
      }

      .categories ul:nth-child(4) {
          --flavour: #7daea3;
      }

      .categories ul:nth-child(5) {
          --flavour: #d3869b;
      }

      .categories ul:nth-child(6) {
          --flavour: #d3869b;
      }

      .categories ul:nth-child(7) {
          --flavour: #a9b665;
      }

      .categories ul:nth-child(8) {
          --flavour: #e78a4e;
      }

      .categories ul:nth-child(9) {
          --flavour: #ea6962;
      }

      .categories ul:nth-child(10) {
          --flavour: #7daea3;
      }

      .categories ul:nth-child(11) {
          --flavour: #d3869b;
      }

      .categories ul:nth-child(12) {
          --flavour: #d3869b;
      }

      .categories ul .links {
          box-shadow: inset -1px 0 var(--flavour);
      }

      .categories ul[active] {
          right: 0;
          z-index: 1;
      }

.categories .links {
    right: 0;
    /* Занимает всё оставшееся место справа от баннера */
    width: calc(100% - 380px); 
    height: 100%;
    background: #282828;
    padding: 40px;
    display: flex;
    flex-wrap: wrap;
    box-sizing: border-box;
    position: absolute;
}
      .categories .links li {
          list-style: none;
      }

      .categories ul .links a {
    color: #d4be98;
    text-decoration: none;
    font: 700 18px 'Roboto', sans-serif;
    transition: all .2s;
    display: inline-flex;
    align-items: center;
    padding: .4em .7em;
    
    /* Стеклянный эффект */
    background: rgba(255, 255, 255, 0.05) !important; 
    backdrop-filter: blur(8px) saturate(140%);
    -webkit-backdrop-filter: blur(8px) saturate(140%);
    
    /* Тонкая рамка для объема */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px; /* Немного увеличил скругление для мягкости */
    
    margin-bottom: .7em;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

      .categories .link-info {
          display: inline-flex;
      }

      .categories .link-info:not(:last-child) { margin-right: .5em; }

      .categories ul .links a:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    transform: translateY(-3px); /* Кнопка слегка всплывает */
    border-color: var(--flavour); /* Подсвечиваем рамку цветом категории */
    color: #fff;
}

.categories ul::after {
    content: attr(class);
    position: absolute;
    display: flex;
    text-transform: uppercase;
    overflow-wrap: break-word;
    width: 25px;
    
    /* 1. Высота плашки */
    height: 450px; 
    
    padding: 1em;
    margin: auto;
    border-radius: 5px;
    box-shadow: inset 0 0 0 2px var(--flavour);

    /* 2. Центрируем внутри области 380px */
    /* 190px — это ровно середина твоего баннера */
    left: 190px; 
    transform: translateX(-50%); 

    bottom: 0;
    top: 0;
    
    /* 3. Фон и слои */
    /* Увеличиваем z-index, чтобы текст был ПОВЕРХ картинки в .banner */
    z-index: 10; 
    background: linear-gradient(to top, rgb(50 48 47 / 90%), transparent);
    
    /* 4. Типографика */
    color: var(--flavour);
    letter-spacing: 1px;
    font: 500 30px 'Nunito', sans-serif;
    text-align: center;
    flex-wrap: wrap;
    word-break: break-all;
    align-items: center;

    /* Размытие фона под текстом (по желанию, убери # если нужно) */
    /* backdrop-filter: blur(3px); */
    
    /* Отключаем клики по тексту, чтобы они проходили сквозь него на ссылки или баннер */
    pointer-events: none; 
}
      .categories .links li:not(:last-child) {
          box-shadow: 0 1px 0 rgba(212, 190, 152, .25);
          padding: 0 0 .5em 0;
          margin-bottom: 1.5em;
      }

      .categories .links li h1 {
          color: #d4be98;
	        opacity: 0.5;
          font-size: 13px;
          margin-bottom: 1em;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: 'Raleway', sans-serif;
      }

      .categories .link-icon {
    font-size: 27px;
    vertical-align: middle;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

      .categories .link-icon + .link-name {
          margin-left: 10px;
      }

      .categories .links-wrapper {
          display: flex;
          flex-wrap: wrap;
      }
      .links {
    position: relative; /* Обязательно */
    z-index: 1;
    overflow: hidden; /* Чтобы размытие не вылезало за края */
    background: #18181d; /* Цвет фона, если картинка не загрузится */
}

.links::before {
    content: "";
    position: absolute;
    top: -10px; left: -10px; right: -10px; bottom: -10px; /* Немного расширяем, чтобы скрыть края блюра */
    
    background-image: var(--bg);
    background-size: cover;
    background-position: center;
    
    /* Используем переменную прозрачности */
    background-color: rgba(0, 0, 0, var(--opacity)); 
    background-blend-mode: darken;
    
    /* Используем переменную блюра */
    filter: blur(var(--blur)); 
    
    z-index: -1;
}

      .ti {
          animation: fadeInAnimation ease .5s;
          animation-iteration-count: 1;
          animation-fill-mode: forwards;
          height: 27px;
          width: 27px;
      }

      @keyframes fadeInAnimation {
          0% {
              opacity: 0;
          }
          100% {
              opacity: 1;
           }
      }
      
      /* ПРЕВЬЮ ПАНЕЛЬ */
#preview-panel {
    display: none;
    position: absolute;
    left: 0;
    top: 0;
    /* Ширина для 9:16 при высоте 675px */
    width: 380px; 
    height: 100%;
    background: #1a1b26;
    z-index: 100;
    flex-direction: column;
    border-right: 2px solid var(--flavour);
}


#close-full {
    pointer-events: auto; /* Возвращаем кликабельность кнопке */
    color: rgba(255, 255, 255, 0.5);
    font: 600 10px 'Raleway', sans-serif;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 10px;
    border-radius: 20px;
    backdrop-filter: blur(5px);
}

#close-full:hover, #close-preview:hover {
    color: #ff5555;
    background: rgba(255, 85, 85, 0.2);
    transform: scale(1.05);
}

#preview-frame { 
    width: 100%; 
    height: 100%; /* Занимаем честные 100% без вычетов */
    border: none; 
    background: #1a1b26; /* Цвет под тему */
}

webview::-webkit-scrollbar {
    width: 0px;
    background: transparent;
}

#full-container, #preview-frame {
    scrollbar-width: none; /* Для Firefox */
    -ms-overflow-style: none; /* Для IE/Edge */
}

#full-container::-webkit-scrollbar,
#preview-frame::-webkit-scrollbar {
    display: none;
}

/* Стили меню закладок (Трей) */
#bookmarks-menu {
    display: none;
    position: fixed;
    bottom: 60px;
    right: 20px;
    width: 250px;
    background: rgba(26, 27, 38, 0.95);
    backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 10005;
    padding: 10px 0;
    flex-direction: column;
}

.bookmark-item {
    display: flex;
    align-items: center;
    padding: 8px 15px;
    color: #d4be98;
    text-decoration: none;
    font-size: 13px;
    transition: background 0.2s;
    cursor: pointer;
}

.bookmark-item span {
    display: block;
    max-width: 150px; /* или любая ширина твоего пункта меню */
    white-space: nowrap;
}

.bookmark-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.bookmark-item img {
    width: 16px;
    height: 16px;
    margin-right: 10px;
}
#bookmark-context-menu {
    position: fixed; /* Именно fixed для Shadow DOM */
    display: none;
    background: #1e1e2e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 5px 0;
    min-width: 160px;
    z-index: 100000; /* Максимальный приоритет */
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    /* УБЕРИТЕ отсюда любые top, left, bottom, right */
}

.ctx-item {
    padding: 8px 15px;
    font-size: 12px;
    color: #d4be98;
    cursor: pointer;
    transition: background 0.2s;
}

.ctx-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

.ctx-item.delete {
    color: #f7768e;
}

.ctx-item.delete:hover {
    background: rgba(247, 118, 142, 0.2);
}
`;