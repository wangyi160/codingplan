/* ── codingplan 公共工具函数 ── */

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeHtmlPreserveBreaks(raw) {
    const normalized = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return escapeHtml(normalized).replace(/\n/g, '<br>');
}

function sanitizeHttpUrl(url, fallback = null) {
    if (typeof url !== 'string' || !url.trim()) {
        return fallback;
    }

    try {
        const parsedUrl = new URL(url, window.location.origin);
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            return parsedUrl.href;
        }
    } catch (error) {
        return fallback;
    }

    return fallback;
}

function renderNotesSection(target, options = {}) {
    const container = typeof target === 'string' ? document.getElementById(target) : target;
    if (!container) {
        return false;
    }

    const items = Array.isArray(options.items) ? options.items : [];
    const emptyBehavior = options.emptyBehavior === 'hide' ? 'hide' : 'clear';

    if (!items.length) {
        if (emptyBehavior === 'hide') {
            container.hidden = true;
        } else {
            container.innerHTML = '';
        }
        return false;
    }

    const title = escapeHtml(options.title || '');
    const titleTag = options.titleTag || 'h3';
    const titleClass = options.titleClass ? ` class="${escapeHtml(options.titleClass)}"` : '';
    const listClass = options.listClass ? ` class="${escapeHtml(options.listClass)}"` : '';
    const renderItem = typeof options.renderItem === 'function'
        ? options.renderItem
        : (item) => escapeHtml(item);

    container.hidden = false;
    container.innerHTML = `
        <${titleTag}${titleClass}>${title}</${titleTag}>
        <ul${listClass}>${items.map((item, index) => `<li>${renderItem(item, index)}</li>`).join('')}</ul>
    `;
    return true;
}

function renderUpdatesSection(target, options = {}) {
    const container = typeof target === 'string' ? document.getElementById(target) : target;
    if (!container) {
        return false;
    }

    const updates = Array.isArray(options.updates) ? options.updates : [];
    const emptyBehavior = options.emptyBehavior === 'hide' ? 'hide' : 'clear';

    if (!updates.length) {
        if (emptyBehavior === 'hide') {
            container.hidden = true;
        } else {
            container.innerHTML = '';
        }
        return false;
    }

    const title = escapeHtml(options.title || '');
    const titleTag = options.titleTag || 'h3';
    const titleClass = options.titleClass ? ` class="${escapeHtml(options.titleClass)}"` : '';
    const listClass = options.listClass ? ` class="${escapeHtml(options.listClass)}"` : ' class="updates-list"';
    const renderDate = typeof options.renderDate === 'function'
        ? options.renderDate
        : (value) => escapeHtml(value);
    const renderItem = typeof options.renderItem === 'function'
        ? options.renderItem
        : (value) => escapeHtml(value);

    container.hidden = false;
    container.innerHTML = `
        <${titleTag}${titleClass}>${title}</${titleTag}>
        <ul${listClass}>
            ${updates.map((update, updateIndex) => `
                <li class="update-item">
                    <div class="log-date">${renderDate(update && update.date, update, updateIndex)}</div>
                    <ul class="update-items">
                        ${((update && Array.isArray(update.items)) ? update.items : []).map((item, itemIndex) => `<li>${renderItem(item, itemIndex, update, updateIndex)}</li>`).join('')}
                    </ul>
                </li>
            `).join('')}
        </ul>
    `;
    return true;
}

// 超宽屏设置
(function () {
    function initUltraWideSettings() {
        const btn = document.getElementById('settingsBtn');
        const panel = document.getElementById('settingsPanel');
        const toggle = document.getElementById('ultraWideToggle');

        if (!btn || !panel || !toggle) {
            return;
        }

        function applyUltraWide(on) {
            document.body.classList.toggle('ultra-wide', on);
            toggle.checked = on;
            localStorage.setItem('ultraWide', on ? '1' : '0');
        }

        if (localStorage.getItem('ultraWide') === '1') {
            applyUltraWide(true);
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.hidden = !panel.hidden;
            btn.classList.toggle('active', !panel.hidden);
        });

        toggle.addEventListener('change', function () {
            applyUltraWide(toggle.checked);
        });

        document.addEventListener('click', function (e) {
            if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
                panel.hidden = true;
                btn.classList.remove('active');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUltraWideSettings, { once: true });
        return;
    }

    initUltraWideSettings();
})();
