// 说明：较新版本的 SillyTavern 不再从 script.js 具名导出 getContext，
// 而是统一通过全局的 SillyTavern.getContext() 获取上下文。
function getContext() {
    return SillyTavern.getContext();
}

const MODULE_NAME = 'future_observer';

// 动态计算扩展在 third-party 下的真实文件夹名，
// 避免因为 Git 仓库/文件夹名与硬编码字符串不一致导致
// renderExtensionTemplateAsync 请求 404、UI 无法渲染的问题。
const EXTENSION_NAME = (() => {
    const parts = import.meta.url.split('/');
    const idx = parts.indexOf('third-party');
    if (idx !== -1 && parts[idx + 1]) {
        return `third-party/${parts[idx + 1]}`;
    }
    console.warn('[Future Observer] 无法从 import.meta.url 解析出扩展文件夹名，使用默认值。当前 url:', import.meta.url);
    return 'third-party/FutureObserver';
})();

const DEFAULT_SETTINGS = Object.freeze({
    messageCount: 10,
    maxChars: 14000,
    mode: 'forum',
    time: '200',
    fabEnabled: true,
    fabX: null,
    fabY: null,
});

const MODES = {
    forum: '未来网络论坛：普通网友、吃瓜群众、历史爱好者互相评论、吐槽、争论。',
    historian: '未来历史研究：历史学者、研究者讨论史料、因果、评价与争议。',
    descendants: '当事人后代：后代看到祖先这段历史后的吐槽、尴尬、骄傲或争论。',
    news: '未来新闻节目：主持人、记者、专家讨论这段历史。',
    mixed: '混合模式：网友、历史学者、后代、媒体等不同身份自然出现。',
};

function getSettings() {
    const ctx = getContext();
    ctx.extensionSettings ??= {};
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const settings = ctx.extensionSettings[MODULE_NAME];
    // 兼容老用户：补全新版本新增的字段，避免旧的 settings 对象缺字段报错
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!(key in settings)) settings[key] = DEFAULT_SETTINGS[key];
    }
    return settings;
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function getRecentChat() {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const settings = getSettings();
    const count = Math.max(1, Math.min(50, Number(settings.messageCount) || 10));
    const start = Math.max(0, chat.length - count);
    const lines = [];

    for (let i = start; i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_system) continue;

        const name = m.is_user
            ? (ctx.name1 || '用户')
            : (m.name || ctx.name2 || '角色');

        const text = String(m.mes ?? '').trim();
        if (text) lines.push(`【${name}】\n${text}`);
    }

    let result = lines.join('\n\n');
    const maxChars = Math.max(2000, Number(settings.maxChars) || 14000);

    if (result.length > maxChars) {
        result = '（仅保留最近部分内容）\n\n' + result.slice(-maxChars);
    }

    return result;
}

function buildPrompt(story) {
    const settings = getSettings();
    const mode = MODES[settings.mode] || MODES.forum;
    const timeMap = {
        '50': '假设事件发生后约50年。',
        '200': '假设事件发生后约200年。',
        '500': '假设事件发生后约500年。',
        '1000': '假设事件发生后约1000年。',
        modern: '假设这段历史一直流传到类似现代的网络时代。',
    };

    return `你是"未来观测器"。

${timeMap[settings.time] || timeMap['200']}
${mode}

请把下面的剧情片段视为已经发生的历史资料，生成一段与当前主线完全分离的"后世评论区"。

【严格规则】
1. 这不是主线续写，不得继续当前剧情。
2. 未来评论不会被当前任何角色看到，不得改变当前世界状态。
3. 不得把评论中的推测当成事实，也不得凭空补充关键历史。
4. 可以出现误解、争论、玩梗、不同立场；评论者可以理解错，但不要让所有人都同一种看法。
5. 评论重点放在这段剧情中真正发生的事件、人物行为和结果。
6. 生成 6～8 条短评论，每条约20～80字。
7. 评论者身份要有明显差异，例如网友、学者、后代、记者等。
8. 要像真实的人讨论历史，不要写成论文。
9. 不要出现"作为AI""提示词""主线"等元话语。
10. 最后不要总结，不要解释生成过程。

【历史片段】
${story}

【未来评论】`;
}

async function generateObservation() {
    // 用 class 选择器，settings 抽屉里的结果框和悬浮球弹窗里的结果框会同时更新，天然保持同步
    const resultBoxes = $('.future-observer-result');
    const buttons = $('.future-observer-generate-btn');

    const story = getRecentChat();
    if (!story) {
        toastr.warning('当前聊天没有可观测的剧情。');
        return;
    }

    buttons.prop('disabled', true).text('观测中…');
    resultBoxes.text('🔭 正在观察未来……');

    try {
        const ctx = getContext();
        let generateQuietPrompt = ctx.generateQuietPrompt;
        if (typeof generateQuietPrompt !== 'function') {
            ({ generateQuietPrompt } = await import('../../../../script.js'));
        }
        const prompt = buildPrompt(story);

        const result = await generateQuietPrompt({
            quietPrompt: prompt,
            quietToLoud: false,
        });

        resultBoxes.text(String(result || '未来观测没有得到结果。').trim());
    } catch (error) {
        console.error('[Future Observer]', error);
        resultBoxes.text(`生成失败：${error?.message || error}`);
        toastr.error('未来观测生成失败，请打开控制台查看错误。');
    } finally {
        buttons.prop('disabled', false).text('🔭 查看未来评价');
    }
}

function syncControlsFromSettings() {
    const settings = getSettings();
    $('#future-observer-count').val(settings.messageCount);
    $('#future-observer-maxchars').val(settings.maxChars);
    $('#future-observer-fab-toggle').prop('checked', settings.fabEnabled !== false);
    $('.future-observer-mode-select').val(settings.mode);
    $('.future-observer-time-select').val(settings.time);
}

function bindSharedControls() {
    // 用事件委托 + 命名空间，避免重复绑定；class 选择器保证设置抽屉和悬浮球弹窗共用同一套逻辑
    $(document).off('change.futureObserverMode').on('change.futureObserverMode', '.future-observer-mode-select', function () {
        const settings = getSettings();
        settings.mode = String($(this).val());
        $('.future-observer-mode-select').val(settings.mode);
        saveSettings();
    });

    $(document).off('change.futureObserverTime').on('change.futureObserverTime', '.future-observer-time-select', function () {
        const settings = getSettings();
        settings.time = String($(this).val());
        $('.future-observer-time-select').val(settings.time);
        saveSettings();
    });

    $(document).off('click.futureObserverGenerate').on('click.futureObserverGenerate', '.future-observer-generate-btn', generateObservation);

    $('#future-observer-count').off('change').on('change', function () {
        const settings = getSettings();
        settings.messageCount = Math.max(1, Math.min(50, Number($(this).val()) || 10));
        $(this).val(settings.messageCount);
        saveSettings();
    });

    $('#future-observer-maxchars').off('change').on('change', function () {
        const settings = getSettings();
        settings.maxChars = Math.max(2000, Math.min(30000, Number($(this).val()) || 14000));
        $(this).val(settings.maxChars);
        saveSettings();
    });

    $('#future-observer-fab-toggle').off('change').on('change', function () {
        const settings = getSettings();
        settings.fabEnabled = $(this).is(':checked');
        saveSettings();
        applyFabVisibility();
    });
}

async function loadSettingsUI() {
    const ctx = getContext();
    const settings = getSettings();

    if (!$('#future-observer-settings').length) {
        const html = await ctx.renderExtensionTemplateAsync(
            EXTENSION_NAME,
            'settings',
            {
                messageCount: settings.messageCount,
                maxChars: settings.maxChars,
            },
        );
        $('#extensions_settings2').append(html);
    }

    syncControlsFromSettings();
    bindSharedControls();
}

// ==================== 悬浮球 ====================

function buildFloatingUI() {
    if ($('#future-observer-fab').length) return;

    const fab = $(
        '<div id="future-observer-fab" class="future-observer-fab" title="未来观测器（可拖动）">🔭</div>',
    );

    const popup = $(`
        <div id="future-observer-popup" class="future-observer-popup" style="display:none;">
            <div class="future-observer-popup-header">
                <span>🔭 未来观测</span>
                <span id="future-observer-popup-close" class="future-observer-popup-close" title="关闭">✕</span>
            </div>
            <div class="future-observer-popup-controls">
                <select class="future-observer-mode-select">
                    <option value="forum">未来网友</option>
                    <option value="historian">历史学者</option>
                    <option value="descendants">当事人后代</option>
                    <option value="news">未来新闻</option>
                    <option value="mixed">混合模式</option>
                </select>
                <select class="future-observer-time-select">
                    <option value="50">50年后</option>
                    <option value="200">200年后</option>
                    <option value="500">500年后</option>
                    <option value="1000">1000年后</option>
                    <option value="modern">现代网络时代</option>
                </select>
            </div>
            <button class="menu_button future-observer-generate-btn">🔭 查看未来评价</button>
            <div class="future-observer-result future-observer-popup-result">点击"查看未来评价"生成。</div>
        </div>
    `);

    $('body').append(fab).append(popup);

    applyFabPosition(fab);
    makeDraggable(fab);
    applyFabVisibility();

    $(document).off('click.futureObserverPopupClose').on('click.futureObserverPopupClose', '#future-observer-popup-close', () => {
        popup.hide();
    });

    // 点击悬浮球/弹窗以外的地方，自动收起弹窗
    $(document).off('mousedown.futureObserverOutside touchstart.futureObserverOutside')
        .on('mousedown.futureObserverOutside touchstart.futureObserverOutside', function (e) {
            if (!popup.is(':visible')) return;
            if ($(e.target).closest('#future-observer-popup, #future-observer-fab').length) return;
            popup.hide();
        });

    $(window).off('resize.futureObserver').on('resize.futureObserver', () => {
        if (popup.is(':visible')) positionPopupNearFab();
    });
}

function applyFabVisibility() {
    const settings = getSettings();
    const fab = $('#future-observer-fab');
    const popup = $('#future-observer-popup');
    if (settings.fabEnabled === false) {
        fab.hide();
        popup.hide();
    } else {
        fab.show();
    }
}

function applyFabPosition(fab) {
    const settings = getSettings();
    if (typeof settings.fabX === 'number' && typeof settings.fabY === 'number') {
        fab.css({ left: settings.fabX + 'px', top: settings.fabY + 'px', right: 'auto', bottom: 'auto' });
    }
}

function positionPopupNearFab() {
    const fab = $('#future-observer-fab');
    const popup = $('#future-observer-popup');
    if (!fab.length || !popup.length) return;

    const rect = fab[0].getBoundingClientRect();
    const popupWidth = popup.outerWidth();
    const popupHeight = popup.outerHeight();

    let left = rect.left;
    let top = rect.top - popupHeight - 10;

    if (top < 10) {
        top = rect.bottom + 10;
    }
    if (top + popupHeight > window.innerHeight - 10) {
        top = Math.max(10, window.innerHeight - popupHeight - 10);
    }
    if (left + popupWidth > window.innerWidth - 10) {
        left = window.innerWidth - popupWidth - 10;
    }
    if (left < 10) left = 10;

    popup.css({ left: left + 'px', top: top + 'px' });
}

function togglePopup() {
    const popup = $('#future-observer-popup');
    if (popup.is(':visible')) {
        popup.hide();
        return;
    }
    syncControlsFromSettings();
    positionPopupNearFab();
    popup.show();
}

function makeDraggable(fab) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;

    function pointFromEvent(e) {
        return e.touches && e.touches.length ? e.touches[0] : e;
    }

    function onDown(e) {
        dragging = true;
        moved = false;
        const p = pointFromEvent(e.originalEvent || e);
        startX = p.clientX;
        startY = p.clientY;
        const rect = fab[0].getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        $(document).on('mousemove.futureObserverDrag touchmove.futureObserverDrag', onMove);
        $(document).on('mouseup.futureObserverDrag touchend.futureObserverDrag', onUp);
    }

    function onMove(e) {
        if (!dragging) return;
        const p = pointFromEvent(e.originalEvent || e);
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;

        let newX = origX + dx;
        let newY = origY + dy;
        const maxX = window.innerWidth - fab.outerWidth();
        const maxY = window.innerHeight - fab.outerHeight();
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        fab.css({ left: newX + 'px', top: newY + 'px', right: 'auto', bottom: 'auto' });

        if ($('#future-observer-popup').is(':visible')) positionPopupNearFab();

        if (e.cancelable) e.preventDefault();
    }

    function onUp() {
        dragging = false;
        $(document).off('.futureObserverDrag');
        if (moved) {
            const rect = fab[0].getBoundingClientRect();
            const settings = getSettings();
            settings.fabX = rect.left;
            settings.fabY = rect.top;
            saveSettings();
        } else {
            togglePopup();
        }
    }

    fab.on('mousedown touchstart', onDown);
}

jQuery(async () => {
    try {
        await loadSettingsUI();
        buildFloatingUI();
    } catch (error) {
        console.error('[Future Observer] Failed to load UI:', error);
        toastr.error('Future Observer 插件界面加载失败，请查看控制台（F12）获取详细报错。', 'Future Observer');
    }
});
