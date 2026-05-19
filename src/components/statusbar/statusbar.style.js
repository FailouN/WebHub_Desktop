window.statusbarStyles = `
      *:not(:defined) { display: none; }

      #tabs {
          width: 100%;
          height: 100%;
          background: transparent !important;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-sizing: border-box;
          position: relative;
      }

      cols {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0 10px;
          height: 100%;
      }

      #tabs ul {
          counter-reset: tabs;
          height: 100%;
          position: relative;
          list-style: none;
          margin-left: 1em;
          display: flex; /* Добавлено, чтобы li шли в ряд */
          padding: 0;
      }

      #tabs ul li:not(:last-child)::after {
          content: counter(tabs, cjk-ideographic);
          counter-increment: tabs;
          display: flex;
          width: 100%;
          height: 100%;
          position: relative;
          align-items: center;
          text-align: center;
          justify-content: center;
      }

      #tabs ul li:not(:last-child) {
          width: 35px;
          text-align: center;
          font: 700 13px 'Yu Gothic', serif;
          color: rgba(212, 190, 152, 0.5);
          transition: all .1s;
          cursor: pointer;
          height: 100%;
          display: flex;
          align-items: center;
          z-index: 2; /* Чтобы кнопки были ПОВЕРХ индикатора */
      }

      #tabs ul li:not(:last-child):hover {
          background: rgba(255, 255, 255, 0.1);
      }

      #tabs ul li:last-child {
          --flavour: var(--accent);
          position: absolute; /* Обязательно */
          width: 35px;
          height: 3px;
          background: var(--flavour);
          bottom: 0;
          transition: all .3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1; /* Под кнопками */
      }

      #tabs ul li[active]:not(:last-child) {
          color: #d4be98;
      }

      /* Твоя рабочая логика отступов */
      #tabs ul li[active]:nth-child(1) ~ li:last-child { margin: 0 0 0 0px; }
      #tabs ul li[active]:nth-child(2) ~ li:last-child { margin: 0 0 0 35px; }
      #tabs ul li[active]:nth-child(3) ~ li:last-child { margin: 0 0 0 70px; }
      #tabs ul li[active]:nth-child(4) ~ li:last-child { margin: 0 0 0 105px; }
      #tabs ul li[active]:nth-child(5) ~ li:last-child { margin: 0 0 0 140px; }
      #tabs ul li[active]:nth-child(6) ~ li:last-child { margin: 0 0 0 175px; }
      #tabs ul li[active]:nth-child(7) ~ li:last-child { margin: 0 0 0 210px; }
      #tabs ul li[active]:nth-child(8) ~ li:last-child { margin: 0 0 0 245px; }
      #tabs ul li[active]:nth-child(9) ~ li:last-child { margin: 0 0 0 280px; }
      #tabs ul li[active]:nth-child(10) ~ li:last-child { margin: 0 0 0 315px; }
      #tabs ul li[active]:nth-child(11) ~ li:last-child { margin: 0 0 0 350px; }
      #tabs ul li[active]:nth-child(12) ~ li:last-child { margin: 0 0 0 385px; }

      /* Цвета */
      #tabs ul li[active]:nth-child(2) ~ li:last-child { --flavour: #e78a4e; }
      #tabs ul li[active]:nth-child(3) ~ li:last-child { --flavour: #ea6962; }
      #tabs ul li[active]:nth-child(4) ~ li:last-child { --flavour: #7daea3; }
      #tabs ul li[active]:nth-child(5) ~ li:last-child { --flavour: #d3869b; }
      #tabs ul li[active]:nth-child(6) ~ li:last-child { --flavour: #89b482; }
      #tabs ul li[active]:nth-child(7) ~ li:last-child { --flavour: #a9b665; }
      #tabs ul li[active]:nth-child(8) ~ li:last-child { --flavour: #e78a4e; }
      #tabs ul li[active]:nth-child(9) ~ li:last-child { --flavour: #ea6962; }
      #tabs ul li[active]:nth-child(10) ~ li:last-child { --flavour: #7daea3; }
      #tabs ul li[active]:nth-child(11) ~ li:last-child { --flavour: #d3869b; }
      #tabs ul li[active]:nth-child(12) ~ li:last-child { --flavour: #89b482; }

      .widgets {
          margin-left: auto;
          display: flex;
          height: 100%;
          align-items: center;
      }

      .widget {
          position: relative;
          height: 100%;
          padding: 0 1em;
          display: flex;
          align-items: center;
          cursor: pointer;
          color: #fff;
          font-size: 12px;
      }

      .widget:hover { background: rgba(255, 255, 255, 0.08); }

      .fastlink {
          border: 0;
          background: rgba(255, 255, 255, 0.05);
          color: #d4be98;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 35px;
          height: 100%;
      }

      .fastlink:hover { background: rgba(255, 255, 255, 0.1); }

      .col-end {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 15px;
      }

      .bookmark-trigger {
          border: none;
          opacity: 0.5;
          background: var(--flavour);
          color: rgba(212, 190, 152, 0.5);
          cursor: pointer;
          transition: opacity 0.2s;
      }
      .bookmark-trigger:hover { opacity: 1; }

     .archive-trigger {
          border: none;
          opacity: 0.5;
          background: var(--flavour);
          color: rgba(212, 190, 152, 0.5);
          cursor: pointer;
          transition: opacity 0.2s;
      }
      .archive-trigger:hover { opacity: 1; }
`;