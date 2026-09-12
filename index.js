import { getContext } from '../../../../script.js';

const MODULE = 'future-observer';
const DEFAULTS = {
    messageCount: 12,
    maxChars: 12000,
    mode: 'forum',
    autoOpen: false,
};

let settings = { ...DEFAULTS };

function loadSettings() {
    const ctx = getContext();
    ctx.extensionSettings ??= {};
    ctx.extensionSettings[MODULE] ??= { ...DEFAULTS };
    settings = { ...DEFAULTS, ...ctx.extensionSettings[MODULE] };
}

function saveSettings() {
    const ctx = getContext();
    ctx.extensionSettings[MODULE] = settings;
    ctx.saveSettingsDebounced();
}

function escapeHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getRecentStory() {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const start = Math.max(0, chat.length - Number(settings.messageCount));
    const parts = [];

    for (let i = start; i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const speaker = m.is_user ? (ctx.name1 || 'User') : (m.name || ctx.name2 || 'Character');
        let text = String(m.mes ?? '').trim();
        if (!text) continue;
        parts.push(`${speaker}: ${text}`);
    }

    let result = parts.join('\n\n');
    if (result.length > Number(settings.maxChars)) {
        result = result.slice(-Number(settings.maxChars));
    }
    return result;
}

function buildPrompt(story, mode) {
    const modeInstruction = {
        forum: '未来网络论坛：多个普通网友、吃瓜群众、历史爱好者互相评论、吐槽、争论。',
        historian: '未来历史研究：历史学者、研究者讨论史料、因果、评价与争议。',
        descendants: '当事人后代：后代看到祖先留下的这段历史后的吐槽、尴尬、骄傲或争论。',
        news: '未来新闻节目：主持人、记者、专家讨论这段历史，允许适度吐槽。',
        mixed: '混合模式：论坛网友、历史学者、后代、媒体等不同身份自然出现。',
    }[mode] || '未来网络论坛：多个普通网友互相评论、吐槽、争论。';

    return `你是“未来观测器”，不是主线剧情的参与者。

下面是一段正在发生的故事。请假设这段故事已经成为未来世界的历史资料。
${modeInstruction}

要求：
1. 这是与主线完全分离的“非正史评论”，不是剧情续写。
2. 不得让当前角色获得这些未来信息，也不得改变当前世界状态。
3. 只评论下面已经发生的内容，不擅自补充关键事实。
4. 允许出现误解、争论、玩梗和不同立场，但应明确是评论者观点。
5. 不要替当前故事继续行动。
6. 输出 5～8 条短评论；每条标明评论者身份。
7. 评论应有明显差异，避免所有人都赞美或都批评。
8. 语言自然、有趣，像真实的人在讨论历史。

【故事片段】
${story}

【未来评论】`;
}

function renderResult(text) {
    const box = document.querySelector('#future-observer-result');
    if (!box) return;
    box.innerHTML = `
        <div class="future-observer-result-head">
            <b>🔭 未来观测</b>
            <button id="future-observer-copy" class="menu_button">复制</button>
        </div>
        <div class="future-observer-result-body">${escapeHtml(text).replaceAll('\n', '<br>')}</div>
    `;
    document.querySelector('#future-observer-copy')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(text);
        toastr.success('已复制');
    });
}

async function generateObservation() {
    const story = getRecentStory();
    if (!story) {
        toastr.warning('当前聊天没有可供观测的剧情。');
        return;
    }

    const ctx = getContext();
    const button = document.querySelector('#future-observer-generate');
    if (button) button.disabled = true;

    try {
        renderResult('正在观察未来……');
        const prompt = buildPrompt(story, settings.mode);
        const result = await ctx.generateRaw({
            systemPrompt: '你是一个独立的“未来历史评论生成器”。绝不把未来评论写回当前主线。',
            prompt,
        });
        renderResult(result || '未来观测没有得到结果。');
    } catch (err) {
        console.error('[Future Observer]', err);
        renderResult(`生成失败：${err?.message || err}`);
        toastr.error('未来观测生成失败，请查看控制台。');
    } finally {
        if (button) button.disabled = false;
    }
}

function buildUI() {
    if (document.querySelector('#future-observer-panel')) return;

    const html = `
    <div id="future-observer-panel" class="future-observer-panel">
        <div class="future-observer-title">🔭 未来观测</div>
        <div class="future-observer-controls">
            <button id="future-observer-generate" class="menu_button">查看未来评价</button>
            <select id="future-observer-mode">
                <option value="forum">未来网友</option>
                <option value="historian">历史学者</option>
                <option value="descendants">当事人后代</option>
                <option value="news">未来新闻</option>
                <option value="mixed">混合模式</option>
            </select>
            <label title="读取最近多少条消息">
                读取 <input id="future-observer-count" type="number" min="1" max="50" value="${settings.messageCount}">
            </label>
        </div>
        <details class="future-observer-details" ${settings.autoOpen ? 'open' : ''}>
            <summary>▶ 未来评论</summary>
            <div id="future-observer-result">点击“查看未来评价”生成。</div>
        </details>
    </div>`;

    const target = document.querySelector('#extensions_settings2');
    if (target) {
        $(target).append(html);
    } else {
        document.body.insertAdjacentHTML('beforeend', html);
    }

    const mode = document.querySelector('#future-observer-mode');
    const count = document.querySelector('#future-observer-count');
    mode.value = settings.mode;

    document.querySelector('#future-observer-generate')?.addEventListener('click', generateObservation);
    mode?.addEventListener('change', () => {
        settings.mode = mode.value;
        saveSettings();
    });
    count?.addEventListener('change', () => {
        settings.messageCount = Math.max(1, Math.min(50, Number(count.value) || DEFAULTS.messageCount));
        count.value = settings.messageCount;
        saveSettings();
    });
}

$(async function () {
    loadSettings();
    buildUI();
});
