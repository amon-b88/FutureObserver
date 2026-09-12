import { getContext } from '../../../../script.js';

const MODULE_NAME = 'future_observer';
const EXTENSION_NAME = 'third-party/FutureObserver';

const DEFAULT_SETTINGS = Object.freeze({
    messageCount: 10,
    maxChars: 14000,
    mode: 'forum',
    time: '200',
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
    return ctx.extensionSettings[MODULE_NAME];
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

    return `你是“未来观测器”。

${timeMap[settings.time] || timeMap['200']}
${mode}

请把下面的剧情片段视为已经发生的历史资料，生成一段与当前主线完全分离的“后世评论区”。

【严格规则】
1. 这不是主线续写，不得继续当前剧情。
2. 未来评论不会被当前任何角色看到，不得改变当前世界状态。
3. 不得把评论中的推测当成事实，也不得凭空补充关键历史。
4. 可以出现误解、争论、玩梗、不同立场；评论者可以理解错，但不要让所有人都同一种看法。
5. 评论重点放在这段剧情中真正发生的事件、人物行为和结果。
6. 生成 6～8 条短评论，每条约20～80字。
7. 评论者身份要有明显差异，例如网友、学者、后代、记者等。
8. 要像真实的人讨论历史，不要写成论文。
9. 不要出现“作为AI”“提示词”“主线”等元话语。
10. 最后不要总结，不要解释生成过程。

【历史片段】
${story}

【未来评论】`;
}

async function generateObservation() {
    const resultBox = $('#future-observer-result');
    const button = $('#future-observer-generate');

    const story = getRecentChat();
    if (!story) {
        toastr.warning('当前聊天没有可观测的剧情。');
        return;
    }

    button.prop('disabled', true).text('观测中…');
    resultBox.text('🔭 正在观察未来……');

    try {
        const { generateQuietPrompt } = await import('../../../../script.js');
        const prompt = buildPrompt(story);

        const result = await generateQuietPrompt({
            quietPrompt: prompt,
            quietToLoud: false,
        });

        resultBox.text(String(result || '未来观测没有得到结果。').trim());
    } catch (error) {
        console.error('[Future Observer]', error);
        resultBox.text(`生成失败：${error?.message || error}`);
        toastr.error('未来观测生成失败，请打开控制台查看错误。');
    } finally {
        button.prop('disabled', false).text('🔭 查看未来评价');
    }
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

    $('#future-observer-count').val(settings.messageCount);
    $('#future-observer-maxchars').val(settings.maxChars);
    $('#future-observer-mode').val(settings.mode);
    $('#future-observer-time').val(settings.time);

    $('#future-observer-count').off('change').on('change', function () {
        settings.messageCount = Math.max(1, Math.min(50, Number($(this).val()) || 10));
        $(this).val(settings.messageCount);
        saveSettings();
    });

    $('#future-observer-maxchars').off('change').on('change', function () {
        settings.maxChars = Math.max(2000, Math.min(30000, Number($(this).val()) || 14000));
        $(this).val(settings.maxChars);
        saveSettings();
    });

    $('#future-observer-mode').off('change').on('change', function () {
        settings.mode = String($(this).val());
        saveSettings();
    });

    $('#future-observer-time').off('change').on('change', function () {
        settings.time = String($(this).val());
        saveSettings();
    });

    $('#future-observer-generate').off('click').on('click', generateObservation);
}

jQuery(async () => {
    try {
        await loadSettingsUI();
    } catch (error) {
        console.error('[Future Observer] Failed to load UI:', error);
    }
});
