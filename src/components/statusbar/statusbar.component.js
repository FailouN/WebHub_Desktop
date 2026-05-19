class Statusbar extends Component {
  externalRefs = {};

  refs = {
    categories: ".categories ul",
    tabs: "#tabs ul li",
    indicator: ".indicator",
    fastlink: ".fastlink",
  };

  currentTabIndex = 0;

  constructor() {
    super();
    this.setDependencies();
  }

  setDependencies() {
    this.externalRefs = {
      categories: this.parentNode.querySelectorAll(this.refs.categories),
    };
  }

  imports() {
    return [
      this.resources.fonts.roboto,
      this.resources.icons.material,
      this.resources.libs.awoo,
    ];
  }

  style() {
    return window.statusbarStyles || ''; 
  }

  template() {
    return `
      <div id="tabs">
          <cols>
              <button class="fastlink" title="Назад">
                <i class="material-icons">arrow_back</i>
              </button>
              <ul class="indicator"></ul>
              <div class="widgets col-end">
                  <button class="widget archive-trigger" title="Архив">
                     <i class="material-icons">inventory_2</i>
                  </button>

                  <button class="widget bookmark-trigger" title="Закладки">
                     <i class="material-icons">bookmarks</i>
                  </button>
                  <current-time class="widget"></current-time>
                  <weather-forecast class="widget weather"></weather-forecast>
              </div>
          </cols>
      </div>`;
  }

  setEvents() {
    // 1. Клики по табам
    this.refs.tabs.forEach((tab) =>
      tab.onclick = ({ target }) => this.handleTabChange(target)
    );

    // 2. Кнопка закладок
    const btn = this.shadowRoot.querySelector('.bookmark-trigger');
    if (btn) {
      btn.onclick = () => {
        this.dispatchEvent(new CustomEvent('toggle-bookmarks', {
          bubbles: true,
          composed: true
        }));
      };
    }

    const archiveBtn = this.shadowRoot.querySelector('.archive-trigger');
    if (archiveBtn) {
      archiveBtn.onclick = () => {
        // Отправляем событие, которое поймает ваш основной скрипт (index.html или preload)
        this.dispatchEvent(new CustomEvent('toggle-archive', {
          bubbles: true,
          composed: true
        }));
      };
    }

    // 3. Глобальные события (через addEventListener для возможности удаления)
    this._handleKeyPress = (e) => this.handleKeyPress(e);
    this._handleWheelScroll = (e) => this.handleWheelScroll(e);
    
    document.addEventListener('keydown', this._handleKeyPress);
    document.addEventListener('wheel', this._handleWheelScroll, { passive: true });

    // 4. Кнопка "Назад"
    this.refs.fastlink.onclick = () => {
      this.dispatchEvent(new CustomEvent('go-back', {
        bubbles: true,
        composed: true
      }));
    }

    // 5. Сохранение последней вкладки
    if (CONFIG.openLastVisitedTab) {
      this._handleBeforeUnload = () => this.saveCurrentTab();
      window.addEventListener('beforeunload', this._handleBeforeUnload);
    }
  }

  // Очистка при удалении компонента (Марафет)
  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleKeyPress);
    document.removeEventListener('wheel', this._handleWheelScroll);
    if (this._handleBeforeUnload) {
      window.removeEventListener('beforeunload', this._handleBeforeUnload);
    }
  }

  saveCurrentTab() {
    // Используем опциональную цепочку, чтобы не упасть если tabs еще нет
    const activeTab = this.tabs ? this.tabs[this.currentTabIndex] : null;
    if (activeTab) {
      localStorage.setItem("lastTabKey", activeTab.name);
    }
  }

  openLastVisitedTab() {
    if (!CONFIG.openLastVisitedTab) return;
    const lastTabKey = localStorage.getItem("lastTabKey"); 

    if (lastTabKey) {
        // Используем requestAnimationFrame для синхронизации с отрисовкой
        requestAnimationFrame(() => {
            this.activateByKey(lastTabKey);
        });
    }
  }

  handleTabChange(tab) {
    const idx = tab.getAttribute("tab-index");
    if (idx !== null) this.activateByKey(Number(idx));
  }

  handleWheelScroll(event) {
    if (!event || !this.refs.tabs) return;
    let { target, deltaY } = event; // wheelDelta устарел, используем deltaY

    if (target.shadow && target.shadow.activeElement) return;

    let activeTab = -1;
    this.refs.tabs.forEach((tab, index) => {
      if (tab.hasAttribute("active")) activeTab = index;
    });

    if (activeTab === -1) return;

    const tabsCount = this.refs.tabs.length - 1; // Минус индикатор
    if (deltaY < 0) { // Скролл вверх
      this.activateByKey((activeTab + 1) % tabsCount);
    } else { // Скролл вниз
      this.activateByKey((activeTab - 1 < 0) ? tabsCount - 1 : activeTab - 1);
    }
  }

  handleKeyPress(event) {
    if (!event) return;
    let { target, key } = event;

    if (target.shadow && target.shadow.activeElement) return;

    const numKey = parseInt(key);
    if (Number.isInteger(numKey) && numKey <= this.externalRefs.categories.length) {
      this.activateByKey(numKey - 1);
    }
  }

  activateByKey(key) {
    // Если передана строка (имя), ищем индекс, иначе используем как индекс
    let index = typeof key === 'string' 
      ? this.tabs.findIndex(t => t.name === key) 
      : key;

    if (index < 0 || index >= this.externalRefs.categories.length) return;
    
    this.currentTabIndex = index;
    this.activate(this.refs.tabs, this.refs.tabs[index]);
    this.activate(
      this.externalRefs.categories,
      this.externalRefs.categories[index],
    );
  }

  createTabs() {
    const categoriesCount = this.externalRefs.categories.length;
    let html = '';
    // Собираем всё в одну строку перед вставкой (Оптимизация)
    for (let i = 0; i < categoriesCount; i++) {
      html += `<li tab-index="${i}" ${i === 0 ? "active" : ""}></li>`;
    }
    html += `<li class="indicator-bar"></li>`; // Последний элемент - полоска
    this.refs.indicator.innerHTML = html;
  }

  activate(target, item) {
    if (target && typeof target.forEach === 'function') {
        target.forEach((i) => {
            if (i) i.removeAttribute("active");
        });
    }
    if (item) {
        item.setAttribute("active", "");
    }
  }

  connectedCallback() {
    this.render().then(() => {
      this.createTabs();
      this.setEvents();
      this.openLastVisitedTab();
    });
  }
}