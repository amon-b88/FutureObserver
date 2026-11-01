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
    aiOnly: false,
    stripOptions: true, // 读取聊天时，自动删掉每楼末尾的 <action>…</action> 选项区（预设生成的待选项，不是已发生的剧情）
    maxChars: 14000,
    richness: 'rich', // 内容量：'brief' | 'normal' | 'rich' | 'epic'
    planFirst: true, // 先构思再写正文（更充实，更耗时；构思部分会被自动删掉）
    skin: 'forum', // 载体：'forum' | 'news' | 'chat' | 'danmaku'
    hotComments: false, // 热评：给评论标赞数，热门的置顶（仅论坛/新闻载体）
    protagonistMode: false, // 主角是否参与讨论；关闭时主角不会出现在评论里
    protagonistName: '', // 主角名，留空=用酒馆里你的用户名
    maxOutputTokens: 0, // 最大输出长度，0=不指定（用接口/酒馆自己的默认值）
    timeDirection: 'future', // 'past' | 'present' | 'future' | 'otherworld'
    identity: 'forum',
    fandomWork: '', // 异世界·同人模式指定的作品名，留空=AI自由选择
    fandomWorkHistory: [], // 之前填过的作品名，最新的在最前面，供输入框旁边的历史下拉用
    fandomSameWorld: false, // 剧情本身就发生在这部作品的世界里（穿越/同人卡），而不是外部围观
    weiboMode: false, // 微博体：先发一条主贴，评论都围绕主贴的具体观点展开
    memoryEnabled: false, // 记忆开关：这次生成会参考"同一类评论者"上一次讨论的内容
    fabEnabled: true,
    worldInfoEnabled: true,
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
        modelList: [], // 上次从端点获取到的可选模型列表，刷新页面后还在，不用每次重新获取
        extraBody: '', // 附加请求参数（JSON），会合并进每次请求，用来传 temperature / reasoning_effort 之类
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

// "误以为剧情发生在自己世界"这个彩蛋，由代码真随机决定要不要触发（不再靠AI自己掌握概率），
// 命中率固定为 8%。触发时从几种不同的"由头"里随机挑一种塞进prompt，避免每次都是同一套模板文字。
const WORLD_BLEED_HINTS = [
    '某位评论者盯着剧情里出现的某个具体物品、地名或称呼，越看越眼熟，怀疑这其实就是他自己所在的世界。',
    '某位评论者从某一句台词的用词习惯或语气里，联想到自己那边最近发生的事，情绪突然绷不住。',
    '某位评论者说不清具体是哪个细节，但一种强烈的直觉告诉他——这不是在看别人的故事，而是在预告他自己的未来。',
    '某位评论者认出了剧情里某个角色的某个特征，跟自己认识的某个人对上了号，瞬间慌了神。',
    '某位评论者算了算剧情里提到的某个时间点，越算越觉得后背发凉，好像跟自己那边的某个日子对上了。',
];

function maybeBuildWorldBleedRule() {
    if (Math.random() >= 0.08) return '';
    const hint = WORLD_BLEED_HINTS[Math.floor(Math.random() * WORLD_BLEED_HINTS.length)];
    return `\n\n另外这次触发了一条低概率隐藏规则：请安排恰好一位评论者（不要多位）产生"这段剧情其实发生在自己所在的那个世界/未来"的错觉，具体的由头是——${hint} 这会让他这条评论明显比其他人更激烈、更慌张（震惊、反复追问、担心自己那边是不是也要出事），跟其他角色轻松围观吃瓜的语气形成鲜明反差。`;
}

function buildFandomIdentityText(work, isSameWorld) {
    const trimmed = String(work || '').trim();
    const scope = trimmed
        ? `本次指定的作品/范围是"${trimmed}"，请只从这个作品里选取角色作为评论者，不要混入其他作品的角色。而且要尊重这些角色在原作里真实的人物关系（比如谁是谁的师父、谁跟谁是对头、谁跟谁是队友），评论/吵架/附和的时候，语气和立场要符合这层原作关系，不要把他们当成互不相干的陌生网友。`
        : '没有指定具体作品，请你自由选取几部大众熟悉的动漫、游戏、电影等作品里的角色来评论，可以混搭多个不同作品的角色，这种情况下角色之间不需要有原作关系，正常当作互不相干的路人网友处理即可。';

    const base = `每个评论者是来自其他虚构作品（动漫、游戏、电影、小说等）的角色，模仿这些角色本身的性格、语气、口头禅去点评这段剧情。${scope}
评论者的网名要贴合该角色的性格/身份设计（可以中二、可以霸气、可以搞笑），并且必须在网名后面用括号标注这个角色的真实姓名，方便认出是谁，网名部分的写法例如：
楼|1|疾风影帝（漩涡鸣人）|这忍术用得也太糙了吧……
楼|3|桃芝丽庄园主（罗宾）|有点意思，这段历史我要记下来。
这条"网名+括号真名"的格式规则，只在这个同人模式下使用。
如果某位评论者提到"要来帮忙""要送/给点什么"这类实际行动，所提供的帮助/物品力度要匹配这个角色在原作里真实的身份地位和能力等级（比如战力顶尖的强者，就不该随口说要送一把普通铁剑这种不符身份的东西），同时也要考虑别让这类帮助严重打破当前故事本身的剧情节奏和强度平衡。`;

    if (isSameWorld) {
        return `${base}

【特别设定：这不是"围观别的世界"，这就是评论者自己的世界】
这次的剧情本身就发生在评论者所在的这个作品世界观里（比如主角穿越/穿书到了这个世界），评论者不是在看一个跟自己无关的外部故事，而是这个世界里真实存在的当地人，剧情里的一切就是发生在他们身边的真事，不是"别人的故事"。
- 不要把这个世界本来就该有的常识/设定当成新奇陌生的东西表示惊讶——比如在鬼灭之刃的世界观里，"鬼"的存在对鬼杀队来说是天经地义的常识，绝不会有人对"竟然有鬼"这种事感到震惊；同理，其他作品里各自的常识设定也一样，不要凭空制造这种不该有的新鲜感。
- 评论者要结合自己在原作里知道的信息（认识的人、去过的地方、经历过的事）来对剧情里具体发生的事件做反应，就像在讨论"最近在我们自己这边发生的事"，而不是像看别人的故事那样置身事外。
- 如果剧情里的主角跟原作角色发生过具体的互动（帮助、伤害、杀死、结识等），评论者要表现出这件事对"他们自己的世界"是真实、有影响的，该震惊震惊、该愤怒愤怒，不能表现得事不关己。`;
    }

    return `${base}${maybeBuildWorldBleedRule()}`;
}

// 记忆的分类粒度：时间方向 + 身份 +（同人模式下）随机/具体作品名。
// 同人·指定作品 按作品名分别独立记忆；同人·随机 不按作品细分，统一记一条。
function getMemoryScopeKey(settings) {
    const direction = settings.timeDirection;
    const identity = settings.identity;
    if (direction === 'otherworld' && identity === 'fandom') {
        const work = String(settings.fandomWork || '').trim();
        return work ? `otherworld:fandom:${work}` : 'otherworld:fandom:random';
    }
    return `${direction}:${identity}`;
}

// 记忆存取：绑定在"当前聊天"本身（chatMetadata），不是全局设置，切换聊天/角色会自动换成对应那条。
function getMemoryStore() {
    const ctx = getContext();
    ctx.chatMetadata ??= {};
    if (!ctx.chatMetadata.future_observer_memory) {
        ctx.chatMetadata.future_observer_memory = {};
    }
    return ctx.chatMetadata.future_observer_memory;
}

function getMemoryEntry(scopeKey) {
    try {
        const store = getMemoryStore();
        return store[scopeKey]?.text || '';
    } catch (error) {
        console.warn('[观察者论坛] 读取记忆失败：', error);
        return '';
    }
}

async function saveMemoryEntry(scopeKey, text) {
    try {
        const ctx = getContext();
        const store = getMemoryStore();
        store[scopeKey] = { text: String(text || '').slice(0, 1500), savedAt: Date.now() };
        if (typeof ctx.saveMetadata === 'function') {
            await ctx.saveMetadata();
        }
    } catch (error) {
        console.warn('[观察者论坛] 保存记忆失败：', error);
    }
}

// 历史记录浏览：跟"记忆"是两回事——记忆是喂给AI看的、只留一条精简版；
// 这个是给你自己翻看的、保留最近几条完整原文，跟"记忆开关"是否打开无关，一直都会记录。
const HISTORY_MAX_ENTRIES = 5;

function getHistoryStore() {
    const ctx = getContext();
    ctx.chatMetadata ??= {};
    if (!ctx.chatMetadata.future_observer_history) {
        ctx.chatMetadata.future_observer_history = {};
    }
    return ctx.chatMetadata.future_observer_history;
}

function getHistoryList(scopeKey) {
    try {
        const store = getHistoryStore();
        return Array.isArray(store[scopeKey]) ? store[scopeKey] : [];
    } catch (error) {
        console.warn('[观察者论坛] 读取历史记录失败：', error);
        return [];
    }
}

async function pushHistoryEntry(scopeKey, text) {
    try {
        const ctx = getContext();
        const store = getHistoryStore();
        const list = Array.isArray(store[scopeKey]) ? store[scopeKey] : [];
        list.push({ text: String(text || ''), savedAt: Date.now() });
        while (list.length > HISTORY_MAX_ENTRIES) list.shift();
        store[scopeKey] = list;
        if (typeof ctx.saveMetadata === 'function') {
            await ctx.saveMetadata();
        }
    } catch (error) {
        console.warn('[观察者论坛] 保存历史记录失败：', error);
    }
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
                settings.customApi[key] = structuredClone(DEFAULT_SETTINGS.customApi[key]);
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

// 删掉预设在楼层里附带的非剧情内容：末尾的"待选项"区块（<action>…</action>，里面是 [Opt1:😇] 这种选项）和 <summary> 摘要，
// 这些是还没被选的备选，不是真正发生的剧情，不应该让观察者去评论。
function stripOptionBlocks(text) {
    let t = String(text ?? '');
    // 1) 完整的 <action>…</action> 区块
    t = t.replace(/<action>[\s\S]*?<\/action>/gi, '');
    // 2) 只有开头 <action> 没有结尾（输出被截断的情况）：从 <action> 一直删到末尾
    t = t.replace(/<action>[\s\S]*$/i, '');
    // 3) 兜底：没有标签、但还留着 [Opt1:xx] 开头的单独成行的选项
    t = t.replace(/^[ \t]*\[Opt\d+\s*[:：][^\]]*\].*$/gim, '');
    // 4) 剧情摘要 <summary>…</summary>：不是剧情本身，也不让评论者看到
    t = t.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
    t = t.replace(/<\/?summary>/gi, ''); // 只剩单个残留标签时，把标签本身去掉
    return t.trim();
}

function getRecentChat() {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const settings = getSettings();
    const count = Math.max(1, Math.min(100, Number(settings.messageCount) || 10));
    const aiOnly = !!settings.aiOnly;
    const lines = [];
    let collected = 0;

    // 从最新的消息往前扫，凑够 count 条符合条件的消息为止；
    // 开了"只读AI"之后，这里的 count 就是精确指"最近N条AI发言"，不再是"N条里混着用户消息"。
    for (let i = chat.length - 1; i >= 0 && collected < count; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        if (aiOnly && m.is_user) continue;

        const name = m.is_user
            ? (ctx.name1 || '用户')
            : (m.name || ctx.name2 || '角色');

        let text = String(m.mes ?? '').trim();
        if (settings.stripOptions !== false) text = stripOptionBlocks(text);
        if (!text) continue;

        lines.unshift(`【${name}】\n${text}`); // 从后往前收集的，最后要倒回正常的时间顺序
        collected++;
    }

    let result = lines.join('\n\n');
    const maxChars = Math.max(2000, Number(settings.maxChars) || 14000);

    if (result.length > maxChars) {
        result = '（仅保留最近部分内容）\n\n' + result.slice(-maxChars);
    }

    return result;
}

// ==================== 内容量 + 随机素材 ====================
// 内容量四档：决定一次生成多少楼、跟帖多少条、每条写多长。
// 另外，每次生成时由代码随机抽几个"讨论焦点"和"说话风格"塞进提示词——
// 这样每次的论坛都会往不同方向发展，而不是同一套八股模板反复出现。
const RICHNESS_OPTIONS = [
    { value: 'brief', label: '精简' },
    { value: 'normal', label: '标准' },
    { value: 'rich', label: '丰富' },
    { value: 'epic', label: '长篇' },
];

const RICHNESS_SPECS = {
    brief: {
        floors: [7, 10], replies: [2, 4], personas: [6, 8], angles: 3,
        lengthText: '约三成是一两句话的短评（20～50字），约五成是中等长度（60～110字），约两成是认真展开的长评（120～200字）',
    },
    normal: {
        floors: [10, 14], replies: [4, 7], personas: [8, 10], angles: 4,
        lengthText: '约三成是一两句话的短评（20～50字），约四成是中等长度（70～130字），约三成是认真展开的长评（150～260字，有具体论证、细节、前因后果）',
    },
    rich: {
        floors: [14, 20], replies: [6, 10], personas: [10, 14], angles: 5,
        lengthText: '约两成是一两句话的短评（20～50字），约四成是中等长度（80～160字），约四成是认真展开的长评（200～350字，有具体论证、细节、前因后果，甚至带一个小故事或亲身经历）',
    },
    epic: {
        floors: [20, 28], replies: [10, 16], personas: [14, 20], angles: 6,
        lengthText: '约两成是一两句话的短评（20～60字），约三成是中等长度（100～200字），约五成是充分展开的长评（250～450字，有层层递进的论证、具体细节、前因后果，甚至带一个小故事或亲身经历）',
    },
};

const DISCUSSION_ANGLES = [
    '有人抓住一个很小、很具体的细节（一个称呼、一件物品、一句台词、一个数字），大做文章、过度解读。',
    '对同一个人物的动机，出现两种截然相反的解读，并且为此吵了起来。',
    '有人提出一个站不住脚但很有意思的脑补/阴谋论，被别人逐条拆台。',
    '有人用自己的生活经验、职业或专业知识来类比这件事（要写出具体细节，不要泛泛而谈）。',
    '有人跑题，聊到完全不相干的事上，结果把一整条楼带歪了。',
    '有人专门抬杠、揪字眼，纠结某个用词或前后细节，被别人嫌烦。',
    '有人认真复盘事件的前因后果，梳理时间线或因果链，并给出一个有风险的预测。',
    '有人情绪上头，语无伦次、反复追问、连发几个问号。',
    '有人吐槽剧情里某个不合理、反常或尴尬的地方，并且说得很具体。',
    '有人转述一个道听途说的传闻或小道消息（要明确标出是传闻，不当作事实）。',
    '有人旗帜鲜明地护着某个角色，护短护得有点夸张，惹来别人调侃。',
    '有人发现了一个别人都没注意到的细节或前后矛盾，引发一阵惊叹或质疑。',
    '有人提出一个很现实、很务实的问题（比如代价、后勤、后果、谁来善后），把气氛从热闹拉回现实。',
];

const VOICE_STYLES = [
    '话痨型：句子长，爱铺垫，爱用括号补充说明',
    '极简型：一两句话就收，言简意赅，甚至有点冲',
    '段子手型：爱用比喻、夸张和梗，笑点来自具体细节',
    '严谨型：条理清晰，爱分点、讲逻辑，但也有自己的偏见',
    '阴阳怪气型：话里有话，明捧暗踩',
    '热心科普型：忍不住解释背景、补充知识',
    '冲浪型：满嘴网络用语、缩写、口头禅，说话跳跃',
    '过来人型：老气横秋，爱讲"当年""我跟你们说"',
    '单纯路人型：看不太懂但很想参与，爱提问',
    '感性型：容易共情，会代入某个人物的处境',
    '杠精型：为反对而反对，但偶尔能说到点子上',
];

function pickRandom(list, n) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

function getRichnessSpec(settings) {
    return RICHNESS_SPECS[settings.richness] || RICHNESS_SPECS.rich;
}

// ==================== 载体（皮肤） ====================
// 同一段剧情可以换不同的"载体"来看。皮肤只影响提示词里的语气要求和界面排版，
// 不会多调用一次AI，所以不增加按次计费的成本。
const SKIN_OPTIONS = [
    { value: 'forum', label: '论坛楼层' },
    { value: 'news', label: '新闻评论区' },
    { value: 'chat', label: '群聊' },
    { value: 'danmaku', label: '弹幕' },
];

const SKIN_SPECS = {
    forum: {
        floorMul: 1, replyMul: 1, noReplies: false, hotAllowed: true, lengthText: null, promptText: '',
    },
    news: {
        floorMul: 1, replyMul: 1, noReplies: false, hotAllowed: true, lengthText: null,
        promptText: '【载体：新闻评论区】这段剧情被当作一则新闻，评论者是新闻底下的跟评网友：有人引用新闻里的某个说法反驳，有人阴阳怪气，有人理中客，有人玩梗；"回|"行表示盖楼回复。整体语气接近真实的新闻评论区。',
    },
    chat: {
        floorMul: 1.6, replyMul: 0.5, noReplies: false, hotAllowed: false,
        lengthText: '绝大多数是一两句话的短消息（8～50字），偶尔有人一口气发一段较长的（80～150字），整体口语化',
        promptText: '【载体：即时聊天群】这些评论是一个聊天群里的消息，不是论坛帖子。像真实群聊：句子偏短、口语化，可以连发、插话、被打断、互相@或引用回复，偶尔发表情文字；"回|"行表示引用并回复了某条消息。整体偏短，不要写成长篇大论。',
    },
    danmaku: {
        floorMul: 2.5, replyMul: 0, noReplies: true, hotAllowed: false,
        lengthText: '每条只有一句话，6～30字，最长不超过40字',
        promptText: '【载体：视频弹幕】这些评论是飘过屏幕的弹幕，不是论坛帖子。每条只有一句话，短促、情绪化、爱玩梗，可以出现刷屏式的复读和接龙、"前方高能""名场面""？？？"这类弹幕式表达，但仍要结合剧情里的具体细节。不要使用"回|"跟帖行，所有弹幕都用"楼|"格式，网名随手起个短的就行。',
    },
};

function getSkinSpec(settings) {
    return SKIN_SPECS[settings.skin] || SKIN_SPECS.forum;
}

// 主角名：优先用设置里手填的，留空就用酒馆里你的用户名
function getProtagonistName() {
    const custom = String(getSettings().protagonistName || '').trim();
    if (custom) return custom;
    try {
        return String(getContext().name1 || '').trim();
    } catch {
        return '';
    }
}

// 读取当前聊天关键词命中的世界书内容（不是整本世界书，是酒馆按关键词触发出来的那部分）。
// 失败/不支持的情况一律静默跳过，不影响正常生成。
async function getWorldInfoText() {
    try {
        const ctx = getContext();
        if (typeof ctx.getWorldInfoPrompt !== 'function') {
            console.log('[观察者论坛][世界书诊断] 当前酒馆版本没有 getWorldInfoPrompt 这个接口，跳过世界书读取。');
            return '';
        }
        const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
        const result = await ctx.getWorldInfoPrompt(chat, 2048, false);
        console.log('[观察者论坛][世界书诊断] getWorldInfoPrompt 原始返回：', result);
        if (!result) {
            console.log('[观察者论坛][世界书诊断] 返回值为空，本次没有世界书内容。');
            return '';
        }
        const parts = [result.worldInfoBefore, result.worldInfoString, result.worldInfoAfter]
            .filter(part => typeof part === 'string' && part.trim());
        const finalText = parts.join('\n').trim();
        console.log('[观察者论坛][世界书诊断] 提取出的文字长度：', finalText.length, finalText ? '（有内容）' : '（是空的）');
        return finalText;
    } catch (error) {
        console.warn('[观察者论坛] 读取世界书失败，本次生成将不携带世界书内容：', error);
        return '';
    }
}

async function buildPrompt(story) {
    const settings = getSettings();
    const direction = DIRECTION_TEXT[settings.timeDirection] ? settings.timeDirection : 'future';
    const spec = getRichnessSpec(settings);
    const skin = getSkinSpec(settings);
    const floorMin = Math.max(5, Math.round(spec.floors[0] * skin.floorMul));
    const floorMax = Math.max(floorMin, Math.round(spec.floors[1] * skin.floorMul));
    const replyMin = skin.noReplies ? 0 : Math.max(1, Math.round(spec.replies[0] * skin.replyMul));
    const replyMax = skin.noReplies ? 0 : Math.max(replyMin, Math.round(spec.replies[1] * skin.replyMul));
    const hotOn = !!settings.hotComments && skin.hotAllowed;
    const protagonist = getProtagonistName();
    const [personaMin, personaMax] = spec.personas;
    const angles = pickRandom(DISCUSSION_ANGLES, spec.angles);
    const voices = pickRandom(VOICE_STYLES, 5);

    let identityText;
    if (direction === 'otherworld' && settings.identity === 'fandom') {
        identityText = buildFandomIdentityText(settings.fandomWork, settings.fandomSameWorld);
    } else {
        const identityTable = IDENTITY_TEXT[direction] || IDENTITY_TEXT.future;
        identityText = identityTable[settings.identity] || Object.values(identityTable)[0];
    }

    const worldInfoText = settings.worldInfoEnabled !== false ? await getWorldInfoText() : '';
    const worldInfoBlock = worldInfoText
        ? `\n【世界设定参考】（背景知识，不是新发生的剧情，仅用于帮助理解剧情里的名词和背景）\n${worldInfoText}\n`
        : '';

    const weiboBlock = settings.weiboMode ? `

【微博体规则】
- 先由评论者里的某一位发一条抓眼球的"主贴"，标题党风格（比如"讨论……""震惊……""只有我觉得……"这种开头），用一两句话说出一个具体、有态度的观点或角度，而不是泛泛复述剧情。
- 主贴单独一行，放在所有楼层之前，用下面这个固定格式（方便程序识别，务必照抄，不要变化）：
主贴|某某|只有我觉得他这波操作离谱吗？
- 之后所有的主楼评论和跟帖，都必须针对这条主贴提出的具体观点来回应（赞同、反驳、追问、玩梗），不要各自评论剧情里不相关的别的地方。
- 楼层编号从主贴之后的第一条评论开始算1楼，主贴本身不算入楼层编号。` : '';

    let memoryBlock = '';
    if (settings.memoryEnabled) {
        const scopeKey = getMemoryScopeKey(settings);
        const lastMemory = getMemoryEntry(scopeKey);
        if (lastMemory) {
            memoryBlock = `\n【上一轮讨论回顾——这是已经过去的旧内容，不是这次要写的东西】
${lastMemory}

【关于这次要怎么处理上面这段回顾，硬性要求】
- 这次是全新的一轮，时间点在上面那轮"之后"，不是同一轮的另一个版本。
- 严禁把上面这段内容换几个词、调整下语序后再发一遍；严禁让新一轮的整体论点、结构跟上面高度重合。
- 必须让人看出"事情往后推进了"：可以是分歧被吵得更激烈、可以是有人退让促成和解、可以是出现了新的具体角度把话题带偏、也可以是干脆没人再提这茬、聊起了全新的话题——具体选哪种你自己判断，但必须明确体现出"这是下一轮"，而不是原地踏步。
- 上面这段回顾只是给你了解"之前发生过什么"，这次要生成的评论内容本身，不需要再重复复述这些旧观点。
`;
        }
    }

    let protagonistBlock = '';
    if (protagonist) {
        protagonistBlock = settings.protagonistMode
            ? `\n\n【主角参与】\n故事的主角「${protagonist}」本人也混在评论者里。要求：\n- 他的网名直接写「${protagonist}」，用符合他性格的口吻发言。\n- 全场他最多发言 2 次（主楼和跟帖合计），而且不能连续两条都是他。\n- 每次发言二选一：发表自己对这件事的感想；或者回复论坛里某个具体的人${skin.noReplies ? '（此载体没有跟帖，直接在内容里点名对方）' : '（用"回|"格式，并填对被回复的楼层编号）'}。\n- 不要每条评论都去回复，也不要让他一次性刷好几条。他的发言不会改变主线剧情。`
            : `\n\n【主角回避】\n故事的主角是「${protagonist}」。评论者里不得出现主角本人，也不要以他的身份或口吻发言；评论里需要提到他时，只能以第三方的口吻谈论他。`;
    }

    const likeField = hotOn ? '赞数|' : '';
    const likeEx = hotOn ? ['128|', '9|', '2315|', '41|', '0|'] : ['', '', '', '', ''];
    const formatLines = skin.noReplies
        ? [`楼|1|某某|${likeEx[0]}……`, `楼|2|某某|${likeEx[1]}……`, `楼|3|某某|${likeEx[2]}……`]
        : [`楼|1|某某|${likeEx[0]}……`, `楼|2|某某|${likeEx[1]}……`, `回|3|2|某某|${likeEx[2]}……`, `回|4|3|某某|${likeEx[3]}……`, `楼|5|某某|${likeEx[4]}……`];
    const formatBlock = `【输出格式——必须严格遵守，程序靠这个格式识别楼层】
每条评论单独占一行（评论里需要分段时，用空格或"／"代替换行，不要在一条评论中间换行），格式固定为：
主楼：楼|楼层编号|网名|${likeField}评论内容${skin.noReplies ? '' : `\n跟帖：回|楼层编号|被回复的楼层编号|网名|${likeField}评论内容`}
示例：
${formatLines.join('\n')}
- 楼层编号从1开始连续递增${skin.noReplies ? '' : '，主楼和跟帖共用同一个编号序列；跟帖里的"被回复的楼层编号"填它回应的那一楼（可以是主楼，也可以是另一条跟帖）'}。
${hotOn ? '- 赞数是纯整数。分布要像真实论坛：少数楼层赞数很高（几百到几千），大多数只有个位数到几十，个别是0；赞数要和评论的质量、争议度、梗的好笑程度相符——吵得凶的、有洞察的、有梗的更高；跟帖的赞数一般比主楼低。\n' : ''}- 竖线 | 只用来分隔字段，评论内容和网名里都不要再出现竖线。
- 除了这些格式行，不要输出任何别的东西：不要开场白、不要分隔线、不要结尾说明、不要Markdown符号、不要加粗。`;

    const angleText = angles.map((a, i) => `${i + 1}. ${a}`).join('\n');
    const voiceText = voices.map(v => `- ${v}`).join('\n');

    const planMin = { brief: 300, normal: 500, rich: 800, epic: 1200 }[settings.richness] || 800;
    const planBlock = settings.planFirst !== false ? `

【写作步骤——分两步】
第一步：先输出 <构思> 和 </构思> 两个标签之间的构思。这部分程序会自动删掉、读者看不到，所以请写得充分、具体，不要偷懒：构思部分不少于 ${planMin} 字，绝对不能只写一两句话。请按下面的小标题逐项填写（构思里可以不遵守输出格式）：
<构思>
【可讨论的细节】至少8条，每条写明是剧情里哪一句话/哪个动作/哪件物品，以及它能引出什么讨论。
【评论者名单】${personaMin}～${personaMax} 位，每位一行：网名｜身份｜立场｜说话习惯｜最在意的点。要彼此差异明显，包括立场对立的人。
【争论线与互动】至少3条会吵起来的争论线，几个跑题/玩梗/脑补点，以及${skin.noReplies ? '谁会接谁的梗' : '楼中楼里谁会接谁的话'}。
【焦点核对】逐条核对上面"本次讨论焦点"是否都安排进去了，没有就补上。
</构思>
第二步：构思结束后，紧接着输出论坛正文，严格使用上面的输出格式。` : '';

    // 格式提醒和"开始写"的提示放在整段提示词的最末尾（模型最容易照做的位置）
    const formatReminder = `（格式提醒：论坛正文的每一行都必须以${skin.noReplies ? '“楼|”' : '“楼|”或“回|”'}开头${settings.weiboMode ? '，主贴行以“主贴|”开头' : ''}，不要改成别的写法，不要写到中途换成“网名：内容”这样的格式。）`;
    const tail = settings.planFirst !== false
        ? `${planBlock}\n\n${formatReminder}\n\n现在开始。先完成第一步（构思），写完构思再接着写论坛正文：\n<构思>`
        : `${formatReminder}\n\n【观察者评论】`;

    return `你是"观察者论坛"。

【时间背景】
${DIRECTION_TEXT[direction]}

【评论者身份】
${identityText}
${skin.promptText ? '\n' + skin.promptText + '\n' : ''}
请把下面的剧情片段视为已经/正在/即将发生（具体哪种，参照上面的时间背景判断）的事，生成一段与当前主线完全分离的"观察者论坛"评论区。

【严格规则】
1. 这不是主线续写，不得继续当前剧情。
2. 这些评论不会被当前任何角色看到，不得改变当前世界状态。
3. 不得把评论中的推测当成事实，也不得凭空补充关键剧情。
4. 可以出现误解、争论、玩梗、不同立场；评论者可以理解错，但不要让所有人都同一种看法。
5. 评论重点放在这段剧情中真正发生的事件、人物行为和结果。
6. 除非身份设定本来就限定为同一类人（比如"当事人论坛"），否则评论者之间身份要有明显差异。
7. 不要出现"作为AI""提示词""主线"等元话语。
8. 最后不要总结，不要解释生成过程。

【数量与长度】
- 生成 ${floorMin}～${floorMax} 条主楼评论${skin.noReplies ? '' : `；另外再写 ${replyMin}～${replyMax} 条楼中楼跟帖（跟帖不算在主楼数量里）`}。
- ${skin.lengthText ? '字数安排：' + skin.lengthText : '字数要有明显起伏，不要每条都差不多长：' + spec.lengthText}。

【质量要求——避免千篇一律】
- 每条评论至少抓住剧情里的一个具体细节（人名、物品、台词、动作、数字、地点），不要空泛地评价。
- 不要每条都走"先复述剧情→再表态→再总结升华"的三段式；不要用"这或许就是……""这正是……的意义"这类金句或升华来收尾；少用排比、对仗这类整齐的句子。
- 每位评论者要有自己的说话习惯、关心的点和立场，不要所有人用同样的句式和语气。
${skin.noReplies ? '- 评论者之间要有呼应：有人接梗、有人跟风复读、有人被带偏。' : '- 评论者之间要有互动：有人点名反驳、有人接梗、有人被带偏。热门楼层可以有 2～4 条跟帖，还可以出现跟帖回复跟帖；冷门楼层可以没人理。'}
- 同一个开头词或口头禅，整个论坛里最多出现两次。
- 像真人打字：允许跑题、半截话、反问、省略号，但不要刻意卖弄。${protagonistBlock}

【本次讨论焦点——由程序随机指定，务必每一条都有人谈到】
${angleText}

【本次语言风格参考——挑几种分配给不同评论者，按身份适配，不必全用】
${voiceText}

${formatBlock}${weiboBlock}
${worldInfoBlock}${memoryBlock}
【剧情片段】
${story}

${tail}`;
}

// opts.signal: 用于取消请求；opts.onChunk(textSoFar): 传了就走流式，边收边回调累计文字
async function callCustomApi(prompt, apiConfig, maxTokens, opts = {}) {
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

    const wantStream = typeof opts.onChunk === 'function';

    // 附加请求参数：用户在设置里填的一段 JSON，原样合并进请求（messages 和 stream 不允许被覆盖）
    let extra = {};
    const extraText = String(apiConfig.extraBody || '').trim();
    if (extraText) {
        try {
            extra = JSON.parse(extraText);
        } catch {
            throw new Error('“附加请求参数”不是合法的 JSON，请检查格式（例如 {"temperature": 0.9}）');
        }
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
            throw new Error('“附加请求参数”必须是一个 JSON 对象，例如 {"temperature": 0.9}');
        }
    }

    const messages = [{ role: 'user', content: prompt }];
    const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: opts.signal,
        body: JSON.stringify({
            model: apiConfig.model || undefined,
            ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
            ...extra,
            messages,
            stream: wantStream,
        }),
    });

    if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 300); } catch { /* 忽略读取失败 */ }
        throw new Error(`自定义API请求失败（状态码 ${response.status}）${detail ? '：' + detail : ''}`);
    }

    // 不要求流式，或者环境不支持读取流：按普通 JSON 处理
    if (!wantStream || !response.body || typeof response.body.getReader !== 'function') {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('自定义API返回内容为空，或者返回格式不是标准的 OpenAI 兼容格式');
        }
        return content;
    }

    // 流式：兼容标准的 SSE（data: {...}）；有的中转站不支持流式、直接返回整段 JSON，也能处理
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let mode = null; // 'sse' | 'json'
    let buffer = '';
    let rawJson = '';
    let acc = '';

    const handleLine = (line) => {
        const t = line.trim();
        if (!t.startsWith('data:')) return;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content;
            if (typeof delta === 'string' && delta) {
                acc += delta;
                opts.onChunk(acc);
            }
        } catch { /* 忽略不是JSON的行（比如心跳） */ }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (mode === null) {
            const head = chunk.trimStart();
            if (!head) continue;
            mode = head.startsWith('{') ? 'json' : 'sse';
        }
        if (mode === 'json') {
            rawJson += chunk;
            continue;
        }
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            handleLine(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
        }
    }
    if (mode === 'sse' && buffer) handleLine(buffer);

    if (mode === 'json') {
        let data;
        try { data = JSON.parse(rawJson); } catch { throw new Error('自定义API返回的内容无法解析'); }
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error(data?.error?.message || '自定义API返回内容为空，或者返回格式不是标准的 OpenAI 兼容格式');
        }
        opts.onChunk(content);
        return content;
    }
    if (!acc) {
        throw new Error('自定义API返回内容为空，或者返回格式不是标准的 OpenAI 兼容格式');
    }
    return acc;
}

// 根据已保存的模型列表，渲染"可选模型"下拉框；没有列表时整行隐藏
function renderCustomApiModelSelect() {
    const settings = getSettings();
    const list = Array.isArray(settings.customApi?.modelList) ? settings.customApi.modelList : [];
    const $row = $('#future-observer-customapi-model-select-row');
    const $select = $('#future-observer-customapi-model-select');
    if (!$row.length) return;
    if (!list.length) {
        $row.hide();
        return;
    }
    $select.empty().append($('<option>', { value: '', text: `— 从列表中选择（共 ${list.length} 个）—` }));
    for (const id of list) {
        $select.append($('<option>', { value: id, text: id }));
    }
    const current = String(settings.customApi?.model || '');
    $select.val(list.includes(current) ? current : '');
    $row.show();
}

// 向端点查询"有哪些可用模型"（OpenAI 兼容接口的标准查询：GET {端点}/models），
// 成功后存起来并渲染成下拉框，省得自己手打模型名。
async function fetchCustomApiModels() {
    const settings = getSettings();
    const api = settings.customApi;

    // 直接从输入框读取最新值（点按钮的瞬间输入框的 change 事件不一定已经保存完），并顺手同步回设置
    api.endpoint = String($('#future-observer-customapi-endpoint').val() ?? api.endpoint ?? '').trim();
    api.apiKey = String($('#future-observer-customapi-key').val() ?? api.apiKey ?? '').trim();

    if (!api.endpoint) {
        toastr.warning('请先填写端点 URL。', '观察者论坛');
        return;
    }

    // 填的可能是 .../v1，也可能是完整的 .../v1/chat/completions，统一退回到根路径再拼 /models
    const base = api.endpoint.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    const url = `${base}/models`;

    const headers = {};
    if (api.apiKey) {
        headers['Authorization'] = `Bearer ${api.apiKey}`;
    }

    const $btn = $('#future-observer-customapi-fetch-models');
    $btn.prop('disabled', true).text('获取中…');
    try {
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.text()).slice(0, 200); } catch { /* 忽略读取失败 */ }
            throw new Error(`状态码 ${response.status}${detail ? '：' + detail : ''}`);
        }

        const data = await response.json();
        // 不同服务返回的结构略有差异，尽量兼容：{data:[...]} / {models:[...]} / 直接是数组
        const rawList = Array.isArray(data?.data) ? data.data
            : Array.isArray(data?.models) ? data.models
                : Array.isArray(data) ? data : [];
        const ids = [...new Set(
            rawList
                .map(item => (typeof item === 'string' ? item : (item?.id || item?.name || '')))
                .map(name => String(name).trim())
                .filter(Boolean),
        )].sort((a, b) => a.localeCompare(b));

        if (!ids.length) {
            toastr.warning('请求成功了，但没解析出任何模型名称（这个服务返回的格式可能比较特殊），请手动填写模型名称。', '观察者论坛');
            return;
        }

        api.modelList = ids.slice(0, 500);
        saveSettings();
        renderCustomApiModelSelect();
        toastr.success(`获取到 ${ids.length} 个模型，请在下面的“可选模型”下拉框里选择。`, '观察者论坛');
    } catch (error) {
        console.error('[观察者论坛] 获取模型列表失败：', error);
        let msg = error?.message || String(error);
        if (error instanceof TypeError) {
            msg += '（可能是网络问题，或者该服务不支持浏览器直接跨域访问 CORS，也可能这个服务压根没有提供模型列表接口）';
        }
        toastr.error(`获取模型列表失败：${msg}。你仍然可以手动填写模型名称。`, '观察者论坛');
    } finally {
        $btn.prop('disabled', false).text('🔄 获取列表');
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 从同人模式的一行评论里，拆出"网名（真名）：内容"这几块，用于"采纳"功能。
// 解析不出来就返回 null（比如AI这次没按格式写），调用方要自己处理这种情况。
function parseFandomLine(rawLine) {
    let text = String(rawLine || '').trim();
    // 去掉开头的楼层编号，例如 "12楼 - " 或 "12楼 - 回复3楼 "
    text = text.replace(/^\d+\s*楼\s*[-—－]?\s*/, '');
    text = text.replace(/回复\s*\d+\s*楼\s*/, '');

    const match = text.match(/^(.*?)[（(]([^（）()]+)[）)]\s*[:：]\s*([\s\S]*)$/);
    if (!match) return null;

    const realName = match[2].trim();
    const content = match[3].trim();
    if (!realName || !content) return null;
    return { realName, content };
}

// 把一条同人评论"采纳"进酒馆自己的正文输入框，格式化成 /sendas 指令，
// 交给你自己看一眼、编辑、决定要不要发送——插件不会自己往聊天记录里硬插东西。
function adoptToInput(realName, content) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        toastr.warning('没找到酒馆的输入框，请手动复制这条内容。', '观察者论坛');
        return;
    }
    const safeName = String(realName).replace(/"/g, '\\"');
    const command = `/sendas name="${safeName}" ${content}`;
    textarea.value = command;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    toastr.success('已填入输入框，确认没问题再自己点发送。', '观察者论坛');
}

// ==================== 解析与渲染 ====================
// 提示词要求AI按固定格式输出：
//   主贴|网名|内容                          （仅微博体）
//   楼|编号|网名|[赞数|]内容
//   回|编号|被回复的编号|网名|[赞数|]内容     （赞数只在开启"热评"时才有）
// 程序只认这几种行，其余的行（开场白、分隔线、乱入的标签）一律丢掉，所以不会再出现无意义的空格子；
// 跟帖明确知道回复的是哪一楼，会挂在那一楼下面。
// 如果AI没按格式写，会尝试识别旧格式（"1楼 - 某某：……"），实在认不出才退回逐行显示。

// 去掉"构思"部分（AI在写正文之前的草稿，读者不需要看到）
function stripPlanBlock(rawText) {
    let t = String(rawText ?? '');
    // 提示词是以"<构思>"结尾的，模型有时会接着往下写而不重复开头标签：有结束标签、前面没有开头标签，就把开头到结束标签都当构思
    const closeAt = t.indexOf('</构思>');
    if (closeAt >= 0 && !t.slice(0, closeAt).includes('<构思>')) {
        t = t.slice(closeAt + '</构思>'.length);
    }
    t = t.replace(/<构思>[\s\S]*?<\/构思>/g, '');
    t = t.replace(/<构思>[\s\S]*$/, ''); // 没写结束标签：说明输出在构思阶段就被截断了
    return t.trim();
}

// 流式输出时，最后一行可能还没写完，丢掉它，免得把半截话接到上一条评论后面
function trimIncompleteTail(text) {
    const s = String(text ?? '');
    const i = s.lastIndexOf('\n');
    return i < 0 ? '' : s.slice(0, i);
}

const RE_MAIN = /^(?:【主贴】|\[主贴\]|主贴)\s*([\s\S]*)$/;
const RE_FLOOR_HEAD = /^(?:主?楼层?)\s*[|｜]\s*([\s\S]+)$/;
const RE_NUMBERED_PIPES = /^(\d+)\s*[|｜]\s*([\s\S]+)$/; // 漏写了开头的"楼|"，直接是 编号|网名|内容
const RE_NAME_COLON = /^([^\s:：|｜]{1,20})\s*[:：]\s*(\S[\s\S]*)$/; // 彻底掉格式：网名：内容
const RE_REPLY_HEAD = /^回(?:复)?\s*[|｜]\s*([\s\S]+)$/;
const RE_LEGACY = /^(\d+)\s*楼\s*[-–—－]?\s*(.+?)\s*(?:回复\s*(\d+)\s*楼\s*)?[:：]\s*([\s\S]+)$/;
const LEGACY_REPLY_MARK = /^[└╰↳→>＞»]+/;

function parseLikes(str) {
    const m = String(str ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([万wWkK]?)$/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (m[2] === '万' || m[2] === 'w' || m[2] === 'W') n *= 10000;
    else if (m[2] === 'k' || m[2] === 'K') n *= 1000;
    return Math.round(n);
}

function formatLikes(n) {
    if (!Number.isFinite(n)) return '';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
}

// 解析 "编号|网名|[赞数|]内容" 这一段（楼）或 "编号|被回复编号|网名|[赞数|]内容"（回）
function parseFloorFields(rest, isReply) {
    const f = rest.split(/[|｜]/).map(x => x.trim());
    const head = isReply ? 3 : 2; // 内容之前至少要有的字段数（不含赞数）
    if (f.length < head + 1) return null;
    if (!/^\d+$/.test(f[0])) return null;
    if (isReply && !/^\d+$/.test(f[1])) return null;

    const name = f[isReply ? 2 : 1];
    if (!name) return null;
    let likes = null;
    let contentParts = f.slice(head);
    if (contentParts.length >= 2) {
        const parsed = parseLikes(contentParts[0]);
        if (parsed !== null && contentParts.slice(1).join('|').trim()) {
            likes = parsed;
            contentParts = contentParts.slice(1);
        }
    }
    const content = contentParts.join('|').trim();
    if (!content) return null;
    return {
        num: Number(f[0]),
        replyTo: isReply ? Number(f[1]) : null,
        name,
        likes,
        content,
    };
}

// loose=true：AI中途掉格式时的宽松模式，会把"网名：内容"、"编号|网名|内容"这样的行也当成新楼层
function parseForumText(text, loose = false) {
    const result = { mainPost: null, roots: [], flat: [], count: 0, mergedLines: 0 };
    const byNum = new Map();
    let last = null;
    let lastRoot = null;

    function addItem(item) {
        item.children = [];
        item.target = null;
        if (item.kind === 'reply') {
            const target = item.replyTo != null ? byNum.get(item.replyTo) : null;
            const root = target ? target.root : lastRoot;
            if (root) {
                item.root = root;
                item.target = target || root;
                item.replyToName = target && target !== root ? target.name : '';
                root.children.push(item);
            } else {
                item.kind = 'floor'; // 找不到可以挂的主楼，就当主楼显示
            }
        }
        if (item.kind === 'floor') {
            item.root = item;
            result.roots.push(item);
            lastRoot = item;
        }
        if (Number.isFinite(item.num) && !byNum.has(item.num)) byNum.set(item.num, item);
        result.flat.push(item);
        result.count++;
        last = item;
    }

    for (const rawLine of String(text || '').split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        let lead = trimmed.replace(/^[*`\s]+/, '');
        if (/^\*\*/.test(trimmed)) lead = lead.replace(/\*+\s*$/, '');
        // 模型有时会加列表符号、编号，或者用【】/[]把整行包起来
        lead = lead.replace(/^[-•·●▪‣]\s+/, '').replace(/^\d{1,3}[.、)）]\s*(?=[楼回主])/, '');
        const wrapped = lead.match(/^[【\[]\s*((?:主?楼层?|回复?|主贴)\s*[|｜][\s\S]*?)\s*[】\]]$/);
        if (wrapped) lead = wrapped[1];
        if (!lead) continue;

        let m = lead.match(RE_MAIN);
        if (m) {
            if (!result.mainPost) {
                const rest = m[1].replace(/^[|｜:：\s]+/, '');
                let name = '';
                let content = rest;
                const sp = rest.match(/^([^|｜:：]{1,30}?)\s*[|｜:：]\s*([\s\S]+)$/);
                if (sp) { name = sp[1].trim(); content = sp[2].trim(); }
                if (content) { result.mainPost = { name, content }; last = result.mainPost; }
            }
            continue;
        }

        m = lead.match(RE_REPLY_HEAD);
        if (m) {
            const f = parseFloorFields(m[1], true);
            if (f) { addItem({ kind: 'reply', ...f }); continue; }
        }

        m = lead.match(RE_FLOOR_HEAD);
        if (m) {
            const f = parseFloorFields(m[1], false);
            if (f) { addItem({ kind: 'floor', ...f }); continue; }
        }

        if (loose) {
            m = lead.match(RE_NUMBERED_PIPES);
            if (m) {
                const f = parseFloorFields(m[0], false);
                if (f) { addItem({ kind: 'floor', ...f }); continue; }
            }
        }

        const legacyText = lead.replace(/^[└╰↳→>＞»\-–—\s]+/, '');
        m = legacyText.match(RE_LEGACY);
        if (m) {
            const isReply = LEGACY_REPLY_MARK.test(trimmed) || m[3] != null;
            addItem({
                kind: isReply ? 'reply' : 'floor',
                num: Number(m[1]),
                replyTo: m[3] != null ? Number(m[3]) : null,
                name: m[2].trim(),
                likes: null,
                content: m[4].trim(),
            });
            continue;
        }

        // 认不出格式的行：纯符号/分隔线/孤立标签直接丢；像是上一条评论的续行就接上去；开场白（还没有任何评论时）丢掉
        if (!/[\p{L}\p{N}]/u.test(lead)) continue;
        if (/^<\/?[^>]{1,30}>$/.test(lead)) continue;
        if (/^[-=_~—]{3,}$/.test(lead)) continue;
        if (loose && last && result.count > 0) {
            const nc = lead.match(RE_NAME_COLON);
            if (nc) {
                const prevNum = Number.isFinite(last.num) ? last.num : result.count;
                addItem({ kind: 'floor', num: prevNum + 1, replyTo: null, name: nc[1].trim(), likes: null, content: nc[2].trim() });
                continue;
            }
        }
        if (last) { last.content += '\n' + lead; result.mergedLines++; }
    }
    return result;
}

// 先按严格格式解析；如果发现大量行被"并进上一条"（说明AI中途掉格式了），就用宽松模式重新解析一遍
function parseForumSmart(text) {
    const strict = parseForumText(text, false);
    if (strict.mergedLines >= 3 && strict.mergedLines > strict.count * 0.4) {
        const loose = parseForumText(text, true);
        if (loose.count > strict.count) return loose;
    }
    return strict;
}

// 网名是否就是主角（网名后面如果带括号标注，括号前面的部分才算）
function isProtagonistName(name, protagonist) {
    if (!protagonist) return false;
    const base = String(name ?? '').replace(/[（(].*$/, '').trim();
    return base === protagonist;
}

// 没开"主角参与"时的保险：就算AI不听话把主角写进来了，也在显示时直接去掉
function dropProtagonist(parsed, protagonist) {
    if (!protagonist) return parsed;
    const keptRoots = [];
    const flat = [];
    for (const root of parsed.roots) {
        if (isProtagonistName(root.name, protagonist)) continue;
        root.children = root.children.filter(c => !isProtagonistName(c.name, protagonist));
        keptRoots.push(root);
        flat.push(root, ...root.children);
    }
    // 保持原来的出现顺序
    const keptSet = new Set(flat);
    const orderedFlat = parsed.flat.filter(x => keptSet.has(x));
    const mainPost = parsed.mainPost && isProtagonistName(parsed.mainPost.name, protagonist) ? null : parsed.mainPost;
    return { mainPost, roots: keptRoots, flat: orderedFlat, count: orderedFlat.length };
}

// 把解析结果还原成朴素文字，存进"记忆"给AI下一轮看；不带那套竖线格式，避免AI下一轮被带偏
function forumToPlainText(parsed) {
    const lines = [];
    if (parsed.mainPost) {
        lines.push(`【主贴】${parsed.mainPost.name ? parsed.mainPost.name + '：' : ''}${parsed.mainPost.content}`);
    }
    for (const root of parsed.roots) {
        lines.push(`${root.num}楼 ${root.name}：${root.content}`);
        for (const child of root.children) {
            const to = child.replyToName ? `回复${child.replyToName}` : `回复${root.num}楼`;
            lines.push(`    ↳ ${child.num}楼 ${child.name} ${to}：${child.content}`);
        }
    }
    return lines.join('\n');
}

// 生成结果的统一清洗入口：去掉"构思"草稿，只留正文（存历史/记忆用）
function cleanForumResult(rawText) {
    return stripPlanBlock(rawText);
}

function floorLabel(item) {
    return Number.isFinite(item.num) ? `${item.num}楼` : '';
}

// 热评怎么选：不是随机。分数 = AI给的赞数 + 这一楼引来的跟帖数×8 + 一点点篇幅加成。
// 也就是"AI认为受欢迎的"和"真的引发了讨论的"综合排名，取最靠前的几条置顶。
function hotScore(root) {
    const likes = Number.isFinite(root.likes) ? root.likes : 0;
    return likes + root.children.length * 8 + Math.min(root.content.length, 300) / 60;
}

function pickHotRoots(roots) {
    if (roots.length < 4) return [];
    const n = roots.length >= 14 ? 3 : 2;
    return roots.slice().sort((a, b) => hotScore(b) - hotScore(a)).slice(0, n);
}

function snippet(text, max) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
}

// 把生成结果渲染成"楼层卡片"。showAdopt: 是否在每条后面加"采纳"按钮（只在同人模式下有意义）
// opts.streaming: 流式输出中，内容还没写完——不做热评重排，末尾加"正在写"提示
function renderResultInto($el, rawText, showAdopt, opts = {}) {
    const settings = getSettings();
    const streaming = !!opts.streaming;
    const raw = String(rawText ?? '');

    // 开了"先构思"，且还没看到构思结束标签、也还没开始出现楼层行：说明还在构思阶段
    const planMode = settings.planFirst !== false;
    const hasFloorLine = /^[\s*]*(?:主贴|主?楼层?|回复?)\s*[|｜]/m.test(raw);
    if (streaming && !/<\/构思>/.test(raw) && ((/<构思>/.test(raw)) || (planMode && !hasFloorLine))) {
        $el.text(`🧠 正在构思……（已写 ${raw.length} 字）`);
        return;
    }

    let text = stripPlanBlock(raw);
    if (streaming) text = trimIncompleteTail(text);
    if (!text) {
        if (streaming) {
            $el.text('✍️ 正在写……');
        } else {
            $el.text(raw.trim() && (/<构思>/.test(raw) || planMode)
                ? '输出在“构思”阶段就被截断了，没写到正文。请在设置里调大“最大输出长度”，或关掉“先构思再写”后重试。'
                : '没有得到结果。');
        }
        return;
    }

    const skin = SKIN_SPECS[settings.skin] ? settings.skin : 'forum';
    const protagonist = getProtagonistName();
    const protagonistOn = !!settings.protagonistMode;
    let parsed = parseForumSmart(text);
    if (!protagonistOn) parsed = dropProtagonist(parsed, protagonist);

    const adoptSource = []; // 与 data-fo-i 下标一一对应，用于事后挂"采纳"按钮
    let idx = 0;
    const pushAdopt = (item) => {
        const m = String(item.name).match(/[（(]([^（）()]+)[）)]\s*$/);
        adoptSource[idx] = m && item.content ? { realName: m[1].trim(), content: item.content } : null;
        return idx++;
    };
    const likesHtml = (item) => (Number.isFinite(item.likes)
        ? `<span class="future-observer-likes">👍 ${escapeHtml(formatLikes(item.likes))}</span>` : '');
    const meBadge = (item) => (protagonistOn && isProtagonistName(item.name, protagonist)
        ? '<span class="future-observer-chip future-observer-chip-small">主角</span>' : '');
    const meClass = (item) => (protagonistOn && isProtagonistName(item.name, protagonist)
        ? ' is-protagonist' : '');

    let html = `<div class="future-observer-feed future-observer-skin-${skin}">`;

    if (parsed.count === 0 && !parsed.mainPost && !streaming && planMode && !/<\/构思>/.test(raw)) {
        // 开了先构思，却没有任何楼层、也没有构思结束标签：多半是输出在构思阶段被截断了
        $el.text('没有识别到论坛格式的内容。可能是输出在“构思”阶段就被截断了（请调大“最大输出长度”），也可能是AI没按格式输出（点下方“查看AI原始输出”看看它写了什么）。');
        return;
    }

    if (parsed.count === 0 && !parsed.mainPost) {
        // 完全认不出格式：退回逐行显示（过滤掉空行和纯符号行）
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => /[\p{L}\p{N}]/u.test(l));
        lines.forEach((line, i) => {
            const fan = parseFandomLine(line);
            adoptSource[i] = fan ? { realName: fan.realName, content: fan.content } : null;
            html += `<div class="future-observer-floor"><div class="future-observer-text">${escapeHtml(line)}</div>`
                + `<span class="future-observer-actions" data-fo-i="${i}"></span></div>`;
        });
    } else {
        if (parsed.mainPost) {
            const mp = parsed.mainPost;
            html += '<div class="future-observer-mainpost"><div class="future-observer-mainpost-head">'
                + '<span class="future-observer-chip">主贴</span>'
                + (mp.name ? `<span class="future-observer-name">${escapeHtml(mp.name)}</span>` : '')
                + `</div><div class="future-observer-text">${escapeHtml(mp.content)}</div></div>`;
        }

        if (skin === 'chat') {
            for (const item of parsed.flat) {
                const i = pushAdopt(item);
                html += `<div class="future-observer-msg${meClass(item)}">`
                    + `<div class="future-observer-msg-name">${escapeHtml(item.name)}${meBadge(item)}</div>`
                    + '<div class="future-observer-bubble">'
                    + (item.kind === 'reply' && item.target
                        ? `<div class="future-observer-quote">↩ ${escapeHtml(item.target.name)}：${escapeHtml(snippet(item.target.content, 24))}</div>` : '')
                    + `<div class="future-observer-text">${escapeHtml(item.content)}</div></div>`
                    + `<span class="future-observer-actions" data-fo-i="${i}"></span></div>`;
            }
        } else if (skin === 'danmaku') {
            for (const item of parsed.flat) {
                const i = pushAdopt(item);
                html += `<div class="future-observer-danmaku-item${meClass(item)}">`
                    + `<span class="future-observer-danmaku-text">${escapeHtml(item.content)}</span>`
                    + `<span class="future-observer-danmaku-name">${escapeHtml(item.name)}</span>`
                    + `<span class="future-observer-actions" data-fo-i="${i}"></span></div>`;
            }
        } else {
            // 论坛楼层 / 新闻评论区：树形结构，跟帖挂在被回复的楼下面
            const renderRoot = (root, hot) => {
                const i = pushAdopt(root);
                let h = `<div class="future-observer-floor${hot ? ' is-hot' : ''}${meClass(root)}">`
                    + '<div class="future-observer-floor-head">'
                    + (hot ? '<span class="future-observer-hot-badge">🔥</span>' : '')
                    + `<span class="future-observer-name">${escapeHtml(root.name)}</span>${meBadge(root)}`
                    + `${likesHtml(root)}<span class="future-observer-num">${escapeHtml(floorLabel(root))}</span></div>`
                    + `<div class="future-observer-text">${escapeHtml(root.content)}</div>`
                    + `<span class="future-observer-actions" data-fo-i="${i}"></span>`;
                if (root.children.length) {
                    h += '<div class="future-observer-replies">';
                    for (const child of root.children) {
                        const j = pushAdopt(child);
                        h += `<div class="future-observer-reply${meClass(child)}">`
                            + `<div class="future-observer-reply-head"><span class="future-observer-name">${escapeHtml(child.name)}</span>${meBadge(child)}`
                            + (child.replyToName ? `<span class="future-observer-reply-to">回复 ${escapeHtml(child.replyToName)}</span>` : '')
                            + `${likesHtml(child)}<span class="future-observer-num">${escapeHtml(floorLabel(child))}</span></div>`
                            + `<div class="future-observer-text">${escapeHtml(child.content)}</div>`
                            + `<span class="future-observer-actions" data-fo-i="${j}"></span></div>`;
                    }
                    h += '</div>';
                }
                return h + '</div>';
            };

            const useHot = !streaming && !!settings.hotComments && SKIN_SPECS[skin].hotAllowed;
            const hotRoots = useHot ? pickHotRoots(parsed.roots) : [];
            if (hotRoots.length) {
                const hotSet = new Set(hotRoots);
                html += '<div class="future-observer-group-title">🔥 热评</div>';
                for (const root of hotRoots) html += renderRoot(root, true);
                html += '<div class="future-observer-group-title">全部评论</div>';
                for (const root of parsed.roots) if (!hotSet.has(root)) html += renderRoot(root, false);
            } else {
                for (const root of parsed.roots) html += renderRoot(root, false);
            }
        }
    }

    if (streaming) html += '<div class="future-observer-streaming">✍️ 正在写……</div>';
    html += '</div>';
    $el.html(html);

    if (showAdopt) {
        adoptSource.forEach((src, i) => {
            if (!src) return;
            const $btn = $('<button type="button" class="future-observer-adopt-btn" title="转成 /sendas 指令填进输入框（不会自动发送）">📥 采纳</button>');
            $btn.data('fo-name', src.realName).data('fo-content', src.content);
            $el.find(`.future-observer-actions[data-fo-i="${i}"]`).append($btn);
        });
    }
}

// 历史浏览游标：纯前端临时状态，不需要持久化，每个"分类"（时间方向+身份+同人作品名）各有自己的游标
const historyCursor = {};

function getCurrentScopeKey() {
    return getMemoryScopeKey(getSettings());
}

function refreshHistoryNav() {
    const scopeKey = getCurrentScopeKey();
    const list = getHistoryList(scopeKey);
    if (!(scopeKey in historyCursor) || historyCursor[scopeKey] > list.length - 1) {
        historyCursor[scopeKey] = list.length - 1; // 默认指向最新一条
    }
    const idx = historyCursor[scopeKey];
    const total = list.length;
    $('.future-observer-history-index').text(total ? `第 ${idx + 1}/${total} 条` : '暂无历史');
    $('.future-observer-history-prev').prop('disabled', idx <= 0);
    $('.future-observer-history-next').prop('disabled', total === 0 || idx >= total - 1);
}

function showHistoryAt(scopeKey, idx) {
    const list = getHistoryList(scopeKey);
    if (idx < 0 || idx >= list.length) return;
    historyCursor[scopeKey] = idx;
    const entry = list[idx];
    const settings = getSettings();
    const showAdopt = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
    $('.future-observer-result').each(function () {
        renderResultInto($(this), entry.text, showAdopt);
    });
    refreshHistoryNav();
}

// 在结果区底部加一个"查看AI原始输出"：格式出问题时，可以看到AI到底写了什么，复制出来排查
function appendRawViewer($el, raw) {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const $wrap = $('<div class="future-observer-rawwrap"></div>');
    $wrap.append('<span class="future-observer-rawtoggle">📄 查看AI原始输出（格式出问题时可复制出来排查）</span>');
    $wrap.append($('<textarea class="future-observer-rawtext" readonly style="display:none;"></textarea>').val(text));
    $el.append($wrap);
}

// 当前正在进行的一次生成（同一时间只允许一次）；取消按钮靠它找到要中断的东西
let currentRun = null;
const CANCELLED = Symbol('cancelled');

function setRunningUI(running) {
    $('.future-observer-generate-btn').prop('disabled', running).text(running ? '观测中…' : '🔭 生成评论区');
    $('.future-observer-cancel-btn').toggle(running);
}

// 取消 = 停止并保留已经写好的部分（只有自定义API的流式输出才有"已写好的部分"）
function cancelGeneration() {
    const run = currentRun;
    if (!run || run.cancelled) return;
    run.cancelled = true;
    try { run.abort.abort(); } catch { /* 忽略 */ }
    if (!run.useCustomApi) {
        try { getContext().stopGeneration?.(); } catch { /* 酒馆版本不支持就算了 */ }
    }
    run.resolveCancel?.();
}

// 流式输出时，节流刷新界面（太频繁地重建DOM会卡，尤其是手机）
function scheduleStreamRender(run) {
    if (run.renderTimer || run.finished) return;
    run.renderTimer = setTimeout(() => {
        run.renderTimer = null;
        if (currentRun !== run || run.finished) return;
        $('.future-observer-result').each(function () {
            const box = this;
            const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
            renderResultInto($(box), run.partial, false, { streaming: true });
            if (nearBottom && $(box).hasClass('future-observer-popup-result')) {
                box.scrollTop = box.scrollHeight;
            }
        });
    }, 150);
}

async function generateObservation() {
    if (currentRun) return; // 已经在生成了，忽略重复点击

    const resultBoxes = $('.future-observer-result');
    const story = getRecentChat();
    if (!story) {
        toastr.warning('当前聊天没有可观测的剧情。');
        return;
    }

    const settings = getSettings();
    const run = {
        cancelled: false,
        abort: new AbortController(),
        useCustomApi: !!settings.customApi?.enabled,
        partial: '',
        renderTimer: null,
        resolveCancel: null,
    };
    currentRun = run;

    setOptionsOpen(false); // 一点生成就把选项折叠起来，把空间让给评论区
    setRunningUI(true);
    resultBoxes.text('🔭 正在观察……');

    try {
        const showAdopt = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
        const maxTokens = Number(settings.maxOutputTokens) || 0;
        let result = '';
        let failed = false;

        try {
            const prompt = await buildPrompt(story);
            if (run.cancelled) throw new Error('cancelled');

            if (run.useCustomApi) {
                result = await callCustomApi(prompt, settings.customApi, maxTokens, {
                    signal: run.abort.signal,
                    onChunk: (text) => {
                        run.partial = text;
                        scheduleStreamRender(run);
                    },
                });
            } else {
                const ctx = getContext();
                let generateQuietPrompt = ctx.generateQuietPrompt;
                if (typeof generateQuietPrompt !== 'function') {
                    ({ generateQuietPrompt } = await import('../../../../script.js'));
                }
                const cancelled = new Promise((resolve) => { run.resolveCancel = () => resolve(CANCELLED); });
                const main = generateQuietPrompt({
                    quietPrompt: prompt,
                    quietToLoud: false,
                    ...(maxTokens > 0 ? { responseLength: maxTokens } : {}),
                });
                main.catch(() => { /* 取消后酒馆那边可能还会报错，这里不管 */ });
                result = await Promise.race([main, cancelled]);
                if (result === CANCELLED) result = '';
            }
        } catch (error) {
            if (run.cancelled) {
                result = run.partial || '';
            } else {
                failed = true;
                console.error('[观察者论坛]', error);
                let msg = error?.message || String(error);
                if (error instanceof TypeError) {
                    msg += '（可能是网络问题，或者对方接口不支持浏览器直连的跨域访问 CORS，请检查端点地址是否正确）';
                }
                resultBoxes.text(`生成失败：${msg}`);
                toastr.error('观测生成失败，请打开控制台查看错误。');
            }
        }

        if (failed) return;

        // 流式阶段到此结束：停掉还没触发的刷新，免得它盖掉下面的最终渲染
        run.finished = true;
        if (run.renderTimer) { clearTimeout(run.renderTimer); run.renderTimer = null; }

        const rawOriginal = result || run.partial || ''; // 原始输出（含构思），供"查看原始输出"用

        if (run.cancelled) {
            // 取消：能保留多少保留多少（最后一行可能只写了一半，丢掉）
            const partial = cleanForumResult(trimIncompleteTail(result || run.partial));
            const parsedPartial = parseForumSmart(partial);
            if (!parsedPartial.count && !parsedPartial.mainPost) {
                resultBoxes.text('已取消。');
                return;
            }
            result = partial;
            toastr.info('已停止，保留了已经写好的部分。', '观察者论坛');
        }

        const cleaned = cleanForumResult(result); // 去掉"构思"草稿，只留正文
        resultBoxes.each(function () {
            renderResultInto($(this), result, showAdopt);
            appendRawViewer($(this), rawOriginal);
        });
        $('.future-observer-popup-result').scrollTop(0);

        if (!cleaned) {
            // 只有构思、没有正文（多半是输出长度不够被截断了），不存历史也不存记忆，免得污染
            return;
        }

        const scopeKey = getMemoryScopeKey(settings);
        await pushHistoryEntry(scopeKey, cleaned); // 历史记录不受"记忆开关"影响，一直都会存
        historyCursor[scopeKey] = getHistoryList(scopeKey).length - 1; // 新生成的这条，游标指向最新
        refreshHistoryNav();

        if (settings.memoryEnabled) {
            const parsed = parseForumSmart(cleaned);
            await saveMemoryEntry(scopeKey, parsed.count ? forumToPlainText(parsed) : cleaned);
        }
    } finally {
        if (run.renderTimer) clearTimeout(run.renderTimer);
        currentRun = null;
        setRunningUI(false);
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

const FANDOM_WORK_HISTORY_MAX = 8;

function rememberFandomWork(work) {
    const trimmed = String(work || '').trim();
    if (!trimmed) return;
    const settings = getSettings();
    const history = Array.isArray(settings.fandomWorkHistory) ? settings.fandomWorkHistory : [];
    const deduped = [trimmed, ...history.filter(w => w !== trimmed)].slice(0, FANDOM_WORK_HISTORY_MAX);
    settings.fandomWorkHistory = deduped;
    saveSettings();
}

function renderFandomHistoryList() {
    const settings = getSettings();
    const history = Array.isArray(settings.fandomWorkHistory) ? settings.fandomWorkHistory : [];
    const $list = $('#future-observer-fandom-history-list');
    if (!history.length) {
        $list.html('<div class="future-observer-fandom-history-empty">还没有填过作品名</div>');
        return;
    }
    $list.empty();
    for (const work of history) {
        $list.append($('<div class="future-observer-fandom-history-item"></div>').text(work));
    }
}

function toggleFandomHistoryList() {
    const $list = $('#future-observer-fandom-history-list');
    if ($list.is(':visible')) {
        $list.hide();
        return;
    }
    renderFandomHistoryList();
    $list.show();
}

function syncControlsFromSettings() {
    const settings = getSettings();

    $('#future-observer-count').val(settings.messageCount);
    $('#future-observer-aionly-toggle').prop('checked', !!settings.aiOnly);
    $('#future-observer-stripoptions-toggle').prop('checked', settings.stripOptions !== false);
    $('#future-observer-maxchars').val(settings.maxChars);
    $('#future-observer-fab-toggle').prop('checked', settings.fabEnabled !== false);
    $('#future-observer-worldinfo-toggle').prop('checked', settings.worldInfoEnabled !== false);
    $('#future-observer-popup-weibo-toggle').prop('checked', !!settings.weiboMode);
    $('#future-observer-popup-memory-toggle').prop('checked', !!settings.memoryEnabled);

    $('.future-observer-direction-select').val(settings.timeDirection);
    $('.future-observer-identity-select').each(function () {
        renderIdentityOptions($(this), settings.timeDirection, settings.identity);
    });
    $('.future-observer-richness-select').val(RICHNESS_SPECS[settings.richness] ? settings.richness : 'rich');
    $('.future-observer-plan-toggle').prop('checked', settings.planFirst !== false);
    $('.future-observer-skin-select').val(SKIN_SPECS[settings.skin] ? settings.skin : 'forum');
    $('.future-observer-hot-toggle').prop('checked', !!settings.hotComments).prop('disabled', !getSkinSpec(settings).hotAllowed);
    $('.future-observer-protagonist-toggle').prop('checked', !!settings.protagonistMode);
    $('.future-observer-protagonist-name').val(settings.protagonistName || '').toggle(!!settings.protagonistMode);
    $('#future-observer-maxtokens').val(Number(settings.maxOutputTokens) || 0);
    applyPopupTheme();
    refreshHistoryNav();

    // 只有"异世界·同人模式"才显示作品名输入框和"同一个世界"勾选框（目前只放在悬浮球弹窗里）
    const showFandomInput = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
    $('#future-observer-fandom-work').val(settings.fandomWork || '');
    $('#future-observer-fandom-work-wrap').toggle(showFandomInput);
    $('#future-observer-fandom-history-list').hide();
    $('#future-observer-fandom-sameworld').prop('checked', !!settings.fandomSameWorld).closest('label').toggle(showFandomInput);
    renderOptionChips();

    $('#future-observer-customapi-toggle').prop('checked', !!settings.customApi?.enabled);
    $('#future-observer-customapi-fields').toggle(!!settings.customApi?.enabled);
    $('#future-observer-customapi-endpoint').val(settings.customApi?.endpoint || '');
    $('#future-observer-customapi-key').val(settings.customApi?.apiKey || '');
    $('#future-observer-customapi-model').val(settings.customApi?.model || '');
    $('#future-observer-customapi-extra').val(settings.customApi?.extraBody || '');
    renderCustomApiModelSelect();
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
        rememberFandomWork(settings.fandomWork);
        saveSettings();
        renderOptionChips();
    });

    $(document).off('click.futureObserverFandomHistoryArrow').on('click.futureObserverFandomHistoryArrow', '#future-observer-fandom-history-arrow', function (e) {
        e.stopPropagation();
        toggleFandomHistoryList();
    });

    $(document).off('click.futureObserverFandomHistoryItem').on('click.futureObserverFandomHistoryItem', '.future-observer-fandom-history-item', function () {
        const settings = getSettings();
        const value = $(this).text();
        settings.fandomWork = value;
        $('#future-observer-fandom-work').val(value);
        saveSettings();
        renderOptionChips();
        $('#future-observer-fandom-history-list').hide();
    });

    $(document).off('mousedown.futureObserverFandomHistoryOutside').on('mousedown.futureObserverFandomHistoryOutside', function (e) {
        if (!$('#future-observer-fandom-history-list').is(':visible')) return;
        if ($(e.target).closest('#future-observer-fandom-work-wrap').length) return;
        $('#future-observer-fandom-history-list').hide();
    });

    $(document).off('click.futureObserverResetOptions').on('click.futureObserverResetOptions', '#future-observer-reset-options', function () {
        const settings = getSettings();
        settings.fandomWork = '';
        settings.fandomSameWorld = false;
        settings.weiboMode = false;
        settings.memoryEnabled = false;
        saveSettings();
        syncControlsFromSettings();
        toastr.info('作品名 / 穿越世界 / 微博体 / 记忆已重置。', '观察者论坛');
    });

    $(document).off('click.futureObserverOptionsToggle').on('click.futureObserverOptionsToggle', '#future-observer-options-toggle, #future-observer-chips', function () {
        setOptionsOpen(!$('#future-observer-optionspanel').is(':visible'));
    });

    $(document).off('change.futureObserverRichness').on('change.futureObserverRichness', '.future-observer-richness-select', function () {
        const settings = getSettings();
        settings.richness = String($(this).val());
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverSkin').on('change.futureObserverSkin', '.future-observer-skin-select', function () {
        const settings = getSettings();
        settings.skin = String($(this).val());
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverHot').on('change.futureObserverHot', '.future-observer-hot-toggle', function () {
        const settings = getSettings();
        settings.hotComments = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverProtagonist').on('change.futureObserverProtagonist', '.future-observer-protagonist-toggle', function () {
        const settings = getSettings();
        settings.protagonistMode = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverProtagonistName').on('change.futureObserverProtagonistName', '.future-observer-protagonist-name', function () {
        const settings = getSettings();
        settings.protagonistName = String($(this).val() || '').trim();
        saveSettings();
    });

    $(document).off('click.futureObserverRaw').on('click.futureObserverRaw', '.future-observer-rawtoggle', function () {
        const $ta = $(this).siblings('.future-observer-rawtext');
        $ta.toggle();
        if ($ta.is(':visible')) {
            $ta.trigger('focus');
            try { $ta.get(0).select(); } catch { /* 忽略 */ }
        }
    });

    $(document).off('click.futureObserverCancel').on('click.futureObserverCancel', '.future-observer-cancel-btn', cancelGeneration);

    $(document).off('change.futureObserverPlan').on('change.futureObserverPlan', '.future-observer-plan-toggle', function () {
        const settings = getSettings();
        settings.planFirst = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverMaxTokens').on('change.futureObserverMaxTokens', '#future-observer-maxtokens', function () {
        const settings = getSettings();
        const n = Math.max(0, Math.min(64000, Math.floor(Number($(this).val()) || 0)));
        settings.maxOutputTokens = n;
        $(this).val(n);
        saveSettings();
    });

    $(document).off('change.futureObserverFandomSameWorld').on('change.futureObserverFandomSameWorld', '#future-observer-fandom-sameworld', function () {
        const settings = getSettings();
        settings.fandomSameWorld = $(this).is(':checked');
        saveSettings();
        renderOptionChips();
    });

    $(document).off('click.futureObserverGenerate').on('click.futureObserverGenerate', '.future-observer-generate-btn', generateObservation);

    $(document).off('click.futureObserverFetchModels').on('click.futureObserverFetchModels', '#future-observer-customapi-fetch-models', fetchCustomApiModels);

    $(document).off('change.futureObserverModelSelect').on('change.futureObserverModelSelect', '#future-observer-customapi-model-select', function () {
        const picked = String($(this).val() || '');
        if (!picked) return; // 选的是顶部提示项，不处理
        const settings = getSettings();
        settings.customApi.model = picked;
        $('#future-observer-customapi-model').val(picked);
        saveSettings();
    });

    $(document).off('click.futureObserverAdopt').on('click.futureObserverAdopt', '.future-observer-adopt-btn', function (e) {
        e.stopPropagation();
        const name = $(this).data('fo-name');
        const content = $(this).data('fo-content');
        if (!name || !content) return;
        adoptToInput(name, content);
    });

    $(document).off('click.futureObserverHistoryPrev').on('click.futureObserverHistoryPrev', '.future-observer-history-prev', function () {
        const scopeKey = getCurrentScopeKey();
        const idx = (historyCursor[scopeKey] ?? getHistoryList(scopeKey).length - 1) - 1;
        showHistoryAt(scopeKey, idx);
    });

    $(document).off('click.futureObserverHistoryNext').on('click.futureObserverHistoryNext', '.future-observer-history-next', function () {
        const scopeKey = getCurrentScopeKey();
        const idx = (historyCursor[scopeKey] ?? getHistoryList(scopeKey).length - 1) + 1;
        showHistoryAt(scopeKey, idx);
    });

    $('#future-observer-count').off('change').on('change', function () {
        const settings = getSettings();
        settings.messageCount = Math.max(1, Math.min(100, Number($(this).val()) || 10));
        $(this).val(settings.messageCount);
        saveSettings();
    });

    $('#future-observer-aionly-toggle').off('change').on('change', function () {
        const settings = getSettings();
        settings.aiOnly = $(this).is(':checked');
        saveSettings();
    });

    $('#future-observer-stripoptions-toggle').off('change').on('change', function () {
        const settings = getSettings();
        settings.stripOptions = $(this).is(':checked');
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

    $('#future-observer-worldinfo-toggle').off('change').on('change', function () {
        const settings = getSettings();
        settings.worldInfoEnabled = $(this).is(':checked');
        saveSettings();
    });

    // 这两个控件是在悬浮球弹窗里，弹窗创建的时机比这里晚，
    // 所以必须用事件委托（绑定在document上，实际点击时才去找目标元素），
    // 不能像上面那样直接对着当前还不存在的元素 $('#id').on(...)，否则绑定会静默失效。
    $(document).off('change.futureObserverWeiboToggle').on('change.futureObserverWeiboToggle', '#future-observer-popup-weibo-toggle', function () {
        const settings = getSettings();
        settings.weiboMode = $(this).is(':checked');
        saveSettings();
        renderOptionChips();
    });

    $(document).off('change.futureObserverMemoryToggle').on('change.futureObserverMemoryToggle', '#future-observer-popup-memory-toggle', function () {
        const settings = getSettings();
        settings.memoryEnabled = $(this).is(':checked');
        saveSettings();
        renderOptionChips();
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

    $('#future-observer-customapi-extra').off('change').on('change', function () {
        const settings = getSettings();
        const text = String($(this).val() || '').trim();
        if (text) {
            try {
                const obj = JSON.parse(text);
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('not object');
            } catch {
                toastr.warning('附加请求参数不是合法的 JSON 对象，已保存，但生成时会报错，请检查。', '观察者论坛');
            }
        }
        settings.customApi.extraBody = text;
        saveSettings();
    });

    $('#future-observer-customapi-model').off('change').on('change', function () {
        const settings = getSettings();
        settings.customApi.model = String($(this).val()).trim();
        saveSettings();
        renderCustomApiModelSelect(); // 手动改了模型名，下拉框也跟着同步选中状态
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
                <span class="future-observer-popup-title"><i class="future-observer-dot"></i>观察者论坛</span>
                <div class="future-observer-popup-header-actions">
                    <span id="future-observer-popup-resize" class="future-observer-popup-icon-btn" title="放大">⤢</span>
                    <span id="future-observer-popup-close" class="future-observer-popup-icon-btn" title="关闭">✕</span>
                </div>
            </div>
            <div class="future-observer-quickrow">
                <select class="future-observer-direction-select">
                    <option value="past">过去</option>
                    <option value="present">现在</option>
                    <option value="future">未来</option>
                    <option value="otherworld">异世界</option>
                </select>
                <select class="future-observer-identity-select"></select>
                <button type="button" id="future-observer-options-toggle" class="future-observer-options-toggle" title="更多选项">⚙</button>
            </div>
            <div id="future-observer-chips" class="future-observer-chips"></div>
            <div id="future-observer-optionspanel" class="future-observer-optionspanel" style="display:none;">
                <div id="future-observer-fandom-work-wrap" class="future-observer-fandom-work-wrap" style="display:none;">
                    <div class="future-observer-fandom-inputrow">
                        <input type="text" id="future-observer-fandom-work" class="future-observer-fandom-input" placeholder="作品名：留空=AI自由选择，或填“火影忍者”">
                        <span id="future-observer-fandom-history-arrow" class="future-observer-popup-icon-btn" title="之前填过的作品">▾</span>
                    </div>
                    <div id="future-observer-fandom-history-list" class="future-observer-fandom-history-list" style="display:none;"></div>
                </div>
                <label class="future-observer-popup-checkbox" style="display:none;"><input type="checkbox" id="future-observer-fandom-sameworld"> 剧情本身就发生在这部作品的世界里（穿越/同人卡）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" id="future-observer-popup-weibo-toggle"> 微博体（先发主贴，评论围绕主贴讨论）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" id="future-observer-popup-memory-toggle"> 记住上一次（参考上次同类型的讨论）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" class="future-observer-plan-toggle"> 先构思再写（更充实，更慢）</label>
                <div class="future-observer-popup-selectrow">
                    <span>载体</span>
                    <select class="future-observer-skin-select">
                        <option value="forum">论坛楼层</option>
                        <option value="news">新闻评论区</option>
                        <option value="chat">群聊</option>
                        <option value="danmaku">弹幕</option>
                    </select>
                </div>
                <label class="future-observer-popup-checkbox"><input type="checkbox" class="future-observer-hot-toggle"> 热评（标赞数，热门的置顶；仅论坛/新闻载体）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" class="future-observer-protagonist-toggle"> 主角参与讨论（不勾选则主角不会出现）</label>
                <input type="text" class="future-observer-protagonist-name" placeholder="主角名（留空=你的用户名）" style="display:none;">
                <div class="future-observer-popup-selectrow">
                    <span>内容量</span>
                    <select class="future-observer-richness-select">
                        <option value="brief">精简</option>
                        <option value="normal">标准</option>
                        <option value="rich">丰富</option>
                        <option value="epic">长篇</option>
                    </select>
                    <button type="button" id="future-observer-reset-options" class="future-observer-reset-btn" title="把作品名/穿越世界/微博体/记忆这几个选项清空复位">↺ 重置</button>
                </div>
            </div>
            <div class="future-observer-history-nav">
                <button type="button" class="future-observer-history-prev menu_button" title="上一条">◀</button>
                <span class="future-observer-history-index">暂无历史</span>
                <button type="button" class="future-observer-history-next menu_button" title="下一条">▶</button>
            </div>
            <div class="future-observer-result future-observer-popup-result">点击下方“生成评论区”查看。</div>
            <div class="future-observer-popup-footer">
                <button type="button" class="menu_button future-observer-generate-btn">🔭 生成评论区</button>
                <button type="button" class="menu_button future-observer-cancel-btn" style="display:none;" title="停止生成，保留已经写好的部分">⏹ 停止</button>
            </div>
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

// 配色跟着"时间方向"变化：过去偏复古黄褐、未来偏科幻蓝、异世界偏紫、现在保持中性绿灰。
// 悬浮弹窗和设置抽屉共用同一套主题色。
function applyPopupTheme() {
    const settings = getSettings();
    const targets = $('#future-observer-popup, #future-observer-settings');
    if (!targets.length) return;
    targets.removeClass(
        'future-observer-theme-past future-observer-theme-present '
        + 'future-observer-theme-future future-observer-theme-otherworld',
    );
    targets.addClass(`future-observer-theme-${settings.timeDirection || 'future'}`);
}

// 展开/折叠"更多选项"面板（只影响界面，不存进设置，每次打开弹窗默认折叠）
function setOptionsOpen(open) {
    $('#future-observer-optionspanel').toggle(!!open);
    $('#future-observer-options-toggle').toggleClass('is-open', !!open);
}

// 折叠状态下，在下拉框下面用小标签显示"当前开了哪些选项"，不用展开也能一眼看到
function renderOptionChips() {
    const settings = getSettings();
    const $chips = $('#future-observer-chips');
    if (!$chips.length) return;
    const chips = [];
    if (settings.timeDirection === 'otherworld' && settings.identity === 'fandom') {
        const work = String(settings.fandomWork || '').trim();
        chips.push(work ? `《${work}》` : '作品随机');
        if (settings.fandomSameWorld) chips.push('同一世界');
    }
    if (settings.skin && settings.skin !== 'forum') {
        chips.push((SKIN_OPTIONS.find(o => o.value === settings.skin) || { label: settings.skin }).label);
    }
    if (settings.weiboMode) chips.push('微博体');
    if (settings.hotComments && getSkinSpec(settings).hotAllowed) chips.push('热评');
    if (settings.protagonistMode) chips.push('主角参与');
    if (settings.memoryEnabled) chips.push('记忆');
    const richLabel = (RICHNESS_OPTIONS.find(o => o.value === settings.richness) || RICHNESS_OPTIONS[2]).label;
    chips.push(`内容·${richLabel}`);
    if (settings.planFirst !== false) chips.push('先构思');
    $chips.empty();
    for (const text of chips) {
        $chips.append($('<span class="future-observer-chip-tag"></span>').text(text));
    }
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
    setOptionsOpen(false); // 每次打开弹窗，选项默认折叠
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
