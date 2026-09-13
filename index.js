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
    console.warn('[观察者论坛] 无法从 import.meta.url 解析出扩展文件夹名，使用默认值。当前 url:', import.meta.url);
    return 'third-party/FutureObserver';
})();

const DEFAULT_SETTINGS = Object.freeze({
    messageCount: 10,
    maxChars: 14000,
    timeDirection: 'future', // 'past' | 'present' | 'future' | 'otherworld'
    identity: 'forum',
    fandomWork: '', // 异世界·同人模式指定的作品名，留空=AI自由选择
    fabEnabled: true,
    fabX: null,
    fabY: null,
    popupX: null,
    popupY: null,
    popupExpanded: false,
    customApi: Object.freeze({
        enabled: false,
        endpoint: '',
        apiKey: '',
        model: '',
    }),
});

// 每个时间方向下拉框里可选的身份视角
const IDENTITY_OPTIONS = {
    past: [
        { value: 'selves', label: '当事人论坛（更早的自己）' },
        { value: 'locals', label: '过去的路人/网友' },
        { value: 'mixed', label: '混合模式' },
    ],
    present: [
        { value: 'selves', label: '当事人论坛（实时）' },
        { value: 'locals', label: '同时代路人网友' },
        { value: 'mixed', label: '混合模式' },
    ],
    future: [
        { value: 'forum', label: '未来网友' },
        { value: 'historian', label: '历史学者' },
        { value: 'descendants', label: '当事人后代' },
        { value: 'news', label: '未来新闻' },
        { value: 'selves', label: '当事人论坛（回忆/翻案）' },
        { value: 'mixed', label: '混合模式' },
    ],
    otherworld: [
        { value: 'title', label: '随机称号模式' },
        { value: 'fandom', label: '同人模式' },
    ],
};

const DIRECTION_OPTIONS = [
    { value: 'past', label: '过去' },
    { value: 'present', label: '现在' },
    { value: 'future', label: '未来' },
    { value: 'otherworld', label: '异世界' },
];

// 时间背景说明文字
const DIRECTION_TEXT = {
    past: '假设存在一个更早的时间点。评论者们正"提前"看到了后续会发生的这段剧情，但他们并不知道这是"未来"，只是单纯地看到了这些即将/已经发生的事，用当时的认知去理解和反应。',
    present: '假设这段剧情正在当下同一时间线上发生。评论者们与故事里的时代背景相同，是同一个"现在"，是正在经历/围观这一切时的实时反应，不是事后回忆。',
    future: '假设这段剧情早已成为很久以前的历史。评论者们站在遥远的未来回望这一切，带着事后诸葛亮式的评价、争论甚至翻案。',
    otherworld: '假设有一群来自完全不同世界/宇宙的观测者，通过某种超越时空的神秘方式围观到了这段剧情。对他们而言，这段剧情本身与他们所在的世界毫无关联，只是一场"来自异世界的奇观"。',
};

// 评论者身份说明文字，按 [时间方向][身份] 两级查找
// 注意：otherworld.fandom 不在这里静态写死，因为它要拼接用户填写的作品名，见 buildFandomIdentityText()
const IDENTITY_TEXT = {
    past: {
        selves: '评论者是故事里角色们更早以前的自己（不必是"少年"——具体处于人生的哪个阶段，或者这个世界观、这个种族是否存在"年龄阶段"这种概念，请你自己根据故事本身的设定判断）。他们此刻并不知道后来会发生这段故事里的事，现在"看到"了，会做出反应、互相议论，甚至互相吐槽对方以后的所作所为。',
        locals: '评论者是那个更早时代里，与主线剧情无关的普通人、路人、网友。他们完全不了解"未来"（也就是现在这段剧情）的背景设定，看到剧情里发生的事（尤其是突发、剧烈的变化）会产生五花八门的反应，不要千篇一律。可以参考但完全不限于以下反应类型（这只是灵感清单，不必照抄，也鼓励自己发挥全新的类型）：\n    - 恐慌笃信派：认定是天罚、异象、末世预兆\n    - 行动派：想要提前找出苗头、动手干预甚至除掉隐患\n    - 虚无摆烂派：看破一切，"横竖要完，不如及时行乐"\n    - 死不信派：坚持这是谣言、恶作剧、胡编的故事\n    - 投机派：盘算着怎么蹭这件事发财、出名、抢占先机\n    - 纯吃瓜派：不站队，单纯看戏起哄\n  请你根据故事本身的世界观和基调，自由挑选/设计几种合适的反应类型分配给不同评论者，不要所有人反应雷同。',
        mixed: '评论者里既有故事角色们更早以前的自己，也有那个时代普通的路人、网友，两类人自然混杂在一起议论、争执，具体每条评论是哪一类身份由你自由决定。',
    },
    present: {
        selves: '评论者是故事里出现过的、真实存在于剧情中的角色们，此刻正处于剧情发生的同一时间线上，是当场、实时的反应——不是事后回忆，而是正在经历这一切时的辩解、争吵、吐槽。',
        locals: '评论者是与主线角色同一时代、但没有直接卷入剧情的普通人、路人、网友，是了解这个世界背景设定的"自己人"，正在实时围观这段剧情的发生，反应更像真实网友的即时吃瓜、起哄、玩梗。',
        mixed: '评论者里既有正在经历这段剧情的当事人，也有同时代实时围观的路人网友，两者混在一起，一边是当事人的辩解，一边是路人的起哄，具体每条评论是哪一类身份由你自由决定。',
    },
    future: {
        forum: '评论者是未来网络论坛上的普通网友、吃瓜群众、历史爱好者，互相评论、吐槽、争论。',
        historian: '评论者是未来的历史学者、研究者，讨论史料、因果、评价与争议，语气更严谨但也可以有派系分歧。',
        descendants: '评论者是当事人的后代，看到祖先这段历史后的吐槽、尴尬、骄傲或争论。',
        news: '评论者是未来新闻节目里的主持人、记者、专家，讨论这段历史。',
        selves: '评论者是故事里出现过的真实角色们，但已经是许多年后的他们——是在回忆、反思，甚至试图翻案、否认、重新解释当年这段经历，语气里带着岁月沉淀后的复杂心态（可能懊悔，可能释怀，可能依然嘴硬）。',
        mixed: '评论者身份不固定，未来网友、历史学者、当事人后代、未来新闻记者、多年后的当事人本人等不同身份自然混杂出现，各自视角不同，具体每条评论是哪一类身份由你自由决定。',
    },
    otherworld: {
        title: '每个评论者都有一个自己现编、听上去很厉害/中二的称号或网名（风格类似"生命之神""邪神""世界守护者"，具体称号完全由你自由发挥、不要重复），然后按照这个称号自带的身份和调性去发言评价这段剧情——语气、立场要符合这个称号该有的"人设"，越有反差和喜感越好。这些称号是临时现编的，不对应任何真实存在的角色，不需要标注真实姓名。',
        // fandom 由 buildFandomIdentityText() 动态生成
    },
};

function buildFandomIdentityText(work) {
    const trimmed = String(work || '').trim();
    const scope = trimmed
        ? `本次指定的作品/范围是"${trimmed}"，请从这个作品里选取角色作为评论者。`
        : '没有指定具体作品，请你自由选取几部大众熟悉的动漫、游戏、电影等作品里的角色来评论，可以混搭多个不同作品的角色。';

    return `每个评论者是来自其他虚构作品（动漫、游戏、电影、小说等）的角色，模仿这些角色本身的性格、语气、口头禅去点评这段剧情。${scope}
评论者的网名要贴合该角色的性格/身份设计（可以中二、可以霸气、可以搞笑），并且必须在网名后面用括号标注这个角色的真实姓名，方便认出是谁，格式例如：
1楼 - 疾风影帝（漩涡鸣人）：这忍术用得也太糙了吧……
3楼 - 桃芝丽庄园主（罗宾）：有点意思，这段历史我要记下来。
这条"网名+括号真名"的格式规则，只在这个同人模式下使用。`;
}

function getSettings() {
    const ctx = getContext();
    ctx.extensionSettings ??= {};
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const settings = ctx.extensionSettings[MODULE_NAME];

    // 兼容老用户：补全新版本新增的字段，避免旧的 settings 对象缺字段报错。
    // 注意：用 structuredClone 逐个克隆默认值，避免多个用户的 settings 意外共享同一个对象引用。
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!(key in settings)) {
            settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
        }
    }
    if (!settings.customApi || typeof settings.customApi !== 'object') {
        settings.customApi = structuredClone(DEFAULT_SETTINGS.customApi);
    } else {
        for (const key of Object.keys(DEFAULT_SETTINGS.customApi)) {
            if (!(key in settings.customApi)) {
                settings.customApi[key] = DEFAULT_SETTINGS.customApi[key];
            }
        }
    }

    // 兼容 v0.3.0 及更早版本：把旧的 mode/time 字段迁移成新的 timeDirection/identity
    if (settings.mode && !settings._migratedV4) {
        settings.timeDirection = 'future';
        settings.identity = settings.mode;
        settings._migratedV4 = true;
        delete settings.mode;
        delete settings.time;
    }

    // 兜底：确保 identity 在当前 timeDirection 下是个合法值
    const validIdentities = (IDENTITY_OPTIONS[settings.timeDirection] || IDENTITY_OPTIONS.future).map(o => o.value);
    if (!validIdentities.includes(settings.identity)) {
        settings.identity = validIdentities[0];
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
    const direction = DIRECTION_TEXT[settings.timeDirection] ? settings.timeDirection : 'future';

    let identityText;
    if (direction === 'otherworld' && settings.identity === 'fandom') {
        identityText = buildFandomIdentityText(settings.fandomWork);
    } else {
        const identityTable = IDENTITY_TEXT[direction] || IDENTITY_TEXT.future;
        identityText = identityTable[settings.identity] || Object.values(identityTable)[0];
    }

    return `你是"观察者论坛"。

【时间背景】
${DIRECTION_TEXT[direction]}

【评论者身份】
${identityText}

请把下面的剧情片段视为已经/正在/即将发生（具体哪种，参照上面的时间背景判断）的事，生成一段与当前主线完全分离的"观察者论坛"评论区。

【严格规则】
1. 这不是主线续写，不得继续当前剧情。
2. 这些评论不会被当前任何角色看到，不得改变当前世界状态。
3. 不得把评论中的推测当成事实，也不得凭空补充关键剧情。
4. 可以出现误解、争论、玩梗、不同立场；评论者可以理解错，但不要让所有人都同一种看法。
5. 评论重点放在这段剧情中真正发生的事件、人物行为和结果。
6. 生成 6～8 条主楼评论，每条约20～80字。
7. 除非身份设定本来就限定为同一类人（比如"当事人论坛"），否则评论者之间身份要有明显差异。
8. 要像真实的人讨论，不要写成论文。
9. 不要出现"作为AI""提示词""主线"等元话语。
10. 最后不要总结，不要解释生成过程。

【楼中楼规则】
- 部分主楼（不是全部，具体几楼有回复、有没有回复，你自己判断，也可以完全没有）会引出1~2条"跟帖"回复，模拟真实论坛里热门楼层有人接话吵/附和、冷门楼层没人理的自然分布。
- 跟帖要针对上一楼的具体内容做回应（附和、反驳、追问、玩梗），不要变成另一条无关评论。
- 用类似下面的格式区分主楼和跟帖（楼层编号连续往下排，跟帖用缩进和"回复X楼"标出）：
1楼 - 某某：……
    └ 2楼 - 某某 回复1楼：……
3楼 - 某某：……

【剧情片段】
${story}

【观察者评论】`;
}

async function callCustomApi(prompt, apiConfig) {
    let url = String(apiConfig.endpoint || '').trim();
    if (!url) {
        throw new Error('自定义API的端点URL没有填写');
    }
    if (!/\/(chat\/completions)\/?$/.test(url)) {
        url = url.replace(/\/+$/, '') + '/chat/completions';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiConfig.apiKey) {
        headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: apiConfig.model || undefined,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
        }),
    });

    if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 300); } catch { /* 忽略读取失败 */ }
        throw new Error(`自定义API请求失败（状态码 ${response.status}）${detail ? '：' + detail : ''}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('自定义API返回内容为空，或者返回格式不是标准的 OpenAI 兼容格式');
    }
    return content;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 把生成结果（纯文本，"1楼 - xxx：..." / "└ 2楼 - xxx 回复1楼：..." 这种格式）
// 解析成一张张"楼层卡片"。判断"是不是跟帖"用的是尽量宽松的规则——
// 这终究是在猜AI输出的文字格式，不可能100%准确，猜不中的话就当普通主楼显示，不影响阅读。
function renderResultInto($el, rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
        $el.text('没有得到结果。');
        return;
    }

    const rawLines = text.split(/\r?\n/).filter(l => l.trim());
    let html = '';
    for (const rawLine of rawLines) {
        const hadLeadingSpace = /^[ \t　]+/.test(rawLine);
        const line = rawLine.trim();
        const isReply = hadLeadingSpace
            || /^[└╰↳→>＞»]+/.test(line)
            || /回复\s*\d*\s*楼/.test(line)
            || /^楼上/.test(line);
        const cleaned = line.replace(/^[└╰↳→>＞»\-–—\s]+/, '');
        const escaped = escapeHtml(cleaned);
        html += isReply
            ? `<div class="future-observer-reply">${escaped}</div>`
            : `<div class="future-observer-comment">${escaped}</div>`;
    }

    $el.html(html || escapeHtml(text));
}

async function generateObservation() {
    // 用 class 选择器，设置抽屉里的结果框和悬浮球弹窗里的结果框会同时更新，天然保持同步
    const resultBoxes = $('.future-observer-result');
    const buttons = $('.future-observer-generate-btn');

    const story = getRecentChat();
    if (!story) {
        toastr.warning('当前聊天没有可观测的剧情。');
        return;
    }

    buttons.prop('disabled', true).text('观测中…');
    resultBoxes.text('🔭 正在观察……');

    try {
        const settings = getSettings();
        const prompt = buildPrompt(story);
        let result;

        if (settings.customApi?.enabled) {
            result = await callCustomApi(prompt, settings.customApi);
        } else {
            const ctx = getContext();
            let generateQuietPrompt = ctx.generateQuietPrompt;
            if (typeof generateQuietPrompt !== 'function') {
                ({ generateQuietPrompt } = await import('../../../../script.js'));
            }
            result = await generateQuietPrompt({
                quietPrompt: prompt,
                quietToLoud: false,
            });
        }

        resultBoxes.each(function () {
            renderResultInto($(this), result);
        });
    } catch (error) {
        console.error('[观察者论坛]', error);
        let msg = error?.message || String(error);
        if (error instanceof TypeError) {
            msg += '（可能是网络问题，或者对方接口不支持浏览器直连的跨域访问 CORS，请检查端点地址是否正确）';
        }
        resultBoxes.text(`生成失败：${msg}`);
        toastr.error('观测生成失败，请打开控制台查看错误。');
    } finally {
        buttons.prop('disabled', false).text('🔭 生成评论区');
    }
}

function renderIdentityOptions($select, direction, currentValue) {
    const options = IDENTITY_OPTIONS[direction] || IDENTITY_OPTIONS.future;
    $select.empty();
    for (const opt of options) {
        $select.append($('<option>', { value: opt.value, text: opt.label }));
    }
    const validValues = options.map(o => o.value);
    $select.val(validValues.includes(currentValue) ? currentValue : validValues[0]);
}

function syncControlsFromSettings() {
    const settings = getSettings();

    $('#future-observer-count').val(settings.messageCount);
    $('#future-observer-maxchars').val(settings.maxChars);
    $('#future-observer-fab-toggle').prop('checked', settings.fabEnabled !== false);

    $('.future-observer-direction-select').val(settings.timeDirection);
    $('.future-observer-identity-select').each(function () {
        renderIdentityOptions($(this), settings.timeDirection, settings.identity);
    });

    // 只有"异世界·同人模式"才显示作品名输入框（目前只放在悬浮球弹窗里）
    const showFandomInput = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
    $('#future-observer-fandom-work').val(settings.fandomWork || '').toggle(showFandomInput);

    $('#future-observer-customapi-toggle').prop('checked', !!settings.customApi?.enabled);
    $('#future-observer-customapi-fields').toggle(!!settings.customApi?.enabled);
    $('#future-observer-customapi-endpoint').val(settings.customApi?.endpoint || '');
    $('#future-observer-customapi-key').val(settings.customApi?.apiKey || '');
    $('#future-observer-customapi-model').val(settings.customApi?.model || '');
}

function bindSharedControls() {
    // 用事件委托 + 命名空间，避免重复绑定；class 选择器保证设置抽屉和悬浮球弹窗共用同一套逻辑
    $(document).off('change.futureObserverDirection').on('change.futureObserverDirection', '.future-observer-direction-select', function () {
        const settings = getSettings();
        settings.timeDirection = String($(this).val());
        const validIdentities = (IDENTITY_OPTIONS[settings.timeDirection] || IDENTITY_OPTIONS.future).map(o => o.value);
        if (!validIdentities.includes(settings.identity)) {
            settings.identity = validIdentities[0];
        }
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverIdentity').on('change.futureObserverIdentity', '.future-observer-identity-select', function () {
        const settings = getSettings();
        settings.identity = String($(this).val());
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverFandomWork').on('change.futureObserverFandomWork', '#future-observer-fandom-work', function () {
        const settings = getSettings();
        settings.fandomWork = String($(this).val()).trim();
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

    $('#future-observer-customapi-toggle').off('change').on('change', function () {
        const settings = getSettings();
        settings.customApi.enabled = $(this).is(':checked');
        saveSettings();
        $('#future-observer-customapi-fields').toggle(settings.customApi.enabled);
    });

    $('#future-observer-customapi-endpoint').off('change').on('change', function () {
        const settings = getSettings();
        settings.customApi.endpoint = String($(this).val()).trim();
        saveSettings();
    });

    $('#future-observer-customapi-key').off('change').on('change', function () {
        const settings = getSettings();
        settings.customApi.apiKey = String($(this).val()).trim();
        saveSettings();
    });

    $('#future-observer-customapi-model').off('change').on('change', function () {
        const settings = getSettings();
        settings.customApi.model = String($(this).val()).trim();
        saveSettings();
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

// ==================== 悬浮球 + 弹窗 ====================

function buildFloatingUI() {
    if ($('#future-observer-fab').length) return;

    const fab = $(
        '<div id="future-observer-fab" class="future-observer-fab" title="观察者论坛（单击展开，拖动挪位置，双击复位面板）">🔭</div>',
    );

    const popup = $(`
        <div id="future-observer-popup" class="future-observer-popup" style="display:none;">
            <div class="future-observer-popup-header">
                <span>🔭 观察者论坛</span>
                <div class="future-observer-popup-header-actions">
                    <span id="future-observer-popup-resize" class="future-observer-popup-icon-btn" title="放大">⤢</span>
                    <span id="future-observer-popup-close" class="future-observer-popup-icon-btn" title="关闭">✕</span>
                </div>
            </div>
            <div class="future-observer-popup-controls">
                <select class="future-observer-direction-select">
                    <option value="past">过去</option>
                    <option value="present">现在</option>
                    <option value="future">未来</option>
                    <option value="otherworld">异世界</option>
                </select>
                <select class="future-observer-identity-select"></select>
                <input type="text" id="future-observer-fandom-work" class="future-observer-fandom-input" placeholder="留空=AI自由选择，也可填“火影忍者”“海贼王”等" style="display:none;">
            </div>
            <button class="menu_button future-observer-generate-btn">🔭 生成评论区</button>
            <div class="future-observer-result future-observer-popup-result">点击“生成评论区”查看。</div>
        </div>
    `);

    $('body').append(fab).append(popup);

    applyFabPosition(fab);
    makeFabDraggable(fab);
    makePopupDraggable(popup);
    applyFabVisibility();
    applyPopupExpandState();
    syncControlsFromSettings();

    $(document).off('click.futureObserverPopupClose').on('click.futureObserverPopupClose', '#future-observer-popup-close', () => {
        popup.hide();
    });

    $(document).off('click.futureObserverPopupResize').on('click.futureObserverPopupResize', '#future-observer-popup-resize', () => {
        const settings = getSettings();
        settings.popupExpanded = !settings.popupExpanded;
        saveSettings();
        applyPopupExpandState();
    });

    // 点击悬浮球/弹窗以外的地方，自动收起弹窗
    $(document).off('mousedown.futureObserverOutside touchstart.futureObserverOutside')
        .on('mousedown.futureObserverOutside touchstart.futureObserverOutside', function (e) {
            if (!popup.is(':visible')) return;
            if ($(e.target).closest('#future-observer-popup, #future-observer-fab').length) return;
            popup.hide();
        });

    $(window).off('resize.futureObserver').on('resize.futureObserver', () => {
        if (popup.is(':visible')) clampPopupIntoView(popup);
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

function applyPopupExpandState() {
    const settings = getSettings();
    const popup = $('#future-observer-popup');
    if (!popup.length) return;
    popup.toggleClass('future-observer-popup-expanded', !!settings.popupExpanded);
    $('#future-observer-popup-resize')
        .text(settings.popupExpanded ? '⤡' : '⤢')
        .attr('title', settings.popupExpanded ? '缩小' : '放大');
    if (popup.is(':visible')) clampPopupIntoView(popup);
}

function clampPopupIntoView(popup) {
    if (!popup.length || !popup.is(':visible')) return;
    const rect = popup[0].getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - popup.outerWidth());
    const maxTop = Math.max(0, window.innerHeight - popup.outerHeight());
    const left = Math.max(0, Math.min(rect.left, maxLeft));
    const top = Math.max(0, Math.min(rect.top, maxTop));
    popup.css({ left: left + 'px', top: top + 'px' });
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
    const settings = getSettings();
    // 先显示再定位，这样才能测量到真实尺寸（display:none 的元素测量不到宽高）
    popup.show();
    if (typeof settings.popupX === 'number' && typeof settings.popupY === 'number') {
        popup.css({ left: settings.popupX + 'px', top: settings.popupY + 'px' });
        clampPopupIntoView(popup);
    } else {
        positionPopupNearFab();
    }
}

function resetPopupPositionAndSize() {
    const settings = getSettings();
    settings.popupX = null;
    settings.popupY = null;
    settings.popupExpanded = false;
    saveSettings();

    const popup = $('#future-observer-popup');
    popup.removeClass('future-observer-popup-expanded');
    $('#future-observer-popup-resize').text('⤢').attr('title', '放大');
    popup.show();
    positionPopupNearFab();
    toastr.info('面板位置和大小已重置。', '观察者论坛');
}

function makeFabDraggable(fab) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;
    let lastClickTime = 0;

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
            return;
        }

        // 单击 vs 双击判断：350ms内的第二次点击视为双击（复位），否则视为单击（展开/收起弹窗）
        const now = Date.now();
        if (now - lastClickTime < 350) {
            lastClickTime = 0;
            resetPopupPositionAndSize();
        } else {
            lastClickTime = now;
            togglePopup();
        }
    }

    fab.on('mousedown touchstart', onDown);
}

function makePopupDraggable(popup) {
    const header = popup.find('.future-observer-popup-header');
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function pointFromEvent(e) {
        return e.touches && e.touches.length ? e.touches[0] : e;
    }

    function onDown(e) {
        // 点在关闭/放大按钮上时不触发拖动，让按钮自己的click正常工作
        if ($(e.target).closest('.future-observer-popup-icon-btn').length) return;

        dragging = true;
        const p = pointFromEvent(e.originalEvent || e);
        startX = p.clientX;
        startY = p.clientY;
        const rect = popup[0].getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        $(document).on('mousemove.futureObserverPopupDrag touchmove.futureObserverPopupDrag', onMove);
        $(document).on('mouseup.futureObserverPopupDrag touchend.futureObserverPopupDrag', onUp);
        if (e.cancelable) e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        const p = pointFromEvent(e.originalEvent || e);
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;

        let newLeft = origLeft + dx;
        let newTop = origTop + dy;
        const maxLeft = Math.max(0, window.innerWidth - popup.outerWidth());
        const maxTop = Math.max(0, window.innerHeight - popup.outerHeight());
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        popup.css({ left: newLeft + 'px', top: newTop + 'px' });
        if (e.cancelable) e.preventDefault();
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        $(document).off('.futureObserverPopupDrag');

        const rect = popup[0].getBoundingClientRect();
        const settings = getSettings();
        settings.popupX = rect.left;
        settings.popupY = rect.top;
        saveSettings();
    }

    header.css('cursor', 'move');
    header.on('mousedown touchstart', onDown);
}

jQuery(async () => {
    try {
        await loadSettingsUI();
        buildFloatingUI();
    } catch (error) {
        console.error('[观察者论坛] Failed to load UI:', error);
        toastr.error('观察者论坛插件界面加载失败，请查看控制台（F12）获取详细报错。', '观察者论坛');
    }
});
