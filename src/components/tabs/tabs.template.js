// tabs.template.js
window.getTabsTemplate = (tabs) => {
    return `
      <div id="links">
        <div id="panels">
          <div class="categories">
            <div id="preview-panel" style="display: none;">
                <webview id="preview-frame" src="" allowpopups></webview>
            </div>

            ${Category.getAll(tabs || [])} 
            
            <div id="full-window">
    <div id="full-container" style="width:100%; height:100%;"></div>
</div>

            <search-bar></search-bar>
            <config-tab></config-tab>
          </div>
        </div>

        <status-bar></status-bar>
        
        <div id="taskbar"></div>

        <div id="close-preview-bar" class="global-btn" style="display: none;">ЗАКРЫТЬ ПРЕВЬЮ</div>
        
        <div id="bookmarks-menu" style="display: none;"></div>
        <div id="bookmark-context-menu" style="display: none;"></div>
      </div>
    `;
};