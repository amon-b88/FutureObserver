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
    forumMode: 'thread', // 形式：'thread' 评论区（一个帖子）| 'forum' 多帖论坛（帖子列表，点进去看回复）
    skin: 'forum', // 载体：'forum' | 'news' | 'chat' | 'danmaku'
    hotComments: false, // 热评：给评论标赞数，热门的置顶（仅论坛/新闻载体）
    protagonistMode: false, // 主角是否参与讨论；关闭时主角不会出现在评论里
    protagonistName: '', // 主角名，留空=用酒馆里你的用户名
    topic: '', // 讨论话题：填了之后，所有发言围绕它展开；留空=讨论剧情
    topicHistory: [], // 最近用过的话题（最多 8 个）
    fandomBoost: false, // 同人加强：生成前查维基资料，减少毁人设
    fandomLibrary: {}, // 同人资料库：{ 作品名: { text, source, time, manual } }
    devMode: false, // 开发者模式：显示完整诊断报告和AI原始输出
    fastTokPerSec: 150, // 输出速度超过这个值（token/秒）时，提示"疑似被分到快速通道"；0=不按速度判断
    mainRaw: false, // 走酒馆主连接时，用"原始生成"（不带预设和聊天历史）
    diagFullPrompt: false, // 诊断报告里是否附带提示词全文（会带上剧情原文，默认不带）
    maxOutputTokens: 0, // 最大输出长度，0=不指定（用接口/酒馆自己的默认值）
    timeDirection: 'future', // 'past' | 'present' | 'future' | 'otherworld'
    identity: 'forum',
    fandomWork: '', // 异世界·同人模式指定的作品名，留空=AI自由选择
    fandomWorkHistory: [], // 之前填过的作品名，最新的在最前面，供输入框旁边的历史下拉用
    fandomSameWorld: false, // 剧情本身就发生在这部作品的世界里（穿越/同人卡），而不是外部围观
    theme: 'aurora', // 主题：'aurora' 极光（随时间方向变色）| 'terminal' 复古终端 | 'blueprint' 蓝图 | 'pop' 波普漫画 | 'steam' 蒸汽朋克 | 'ink' 水墨
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
        { value: 'selves', label: '当事人（更早的自己）' },
        { value: 'locals', label: '旁观者（过去的路人/网友）' },
    ],
    present: [
        { value: 'selves', label: '当事人（实时）' },
        { value: 'locals', label: '旁观者（同时代路人网友）' },
    ],
    future: [
        { value: 'selves', label: '当事人（多年后回忆/翻案）' },
        { value: 'onlookers', label: '旁观者（后世网友/学者/后代/新闻）' },
    ],
    otherworld: [
        { value: 'title', label: '随机称号模式' },
        { value: 'fandom', label: '同人模式' },
    ],
};

// 视角下拉框：时间方向 + 身份合成一个选择（值的格式是 "方向:身份"）
const PERSPECTIVE_GROUPS = [
    { label: '当事人', items: [
        { value: 'past:selves', label: '当事人 · 过去（更早的自己）' },
        { value: 'present:selves', label: '当事人 · 现在（实时）' },
        { value: 'future:selves', label: '当事人 · 未来（多年后）' },
    ] },
    { label: '旁观者', items: [
        { value: 'past:locals', label: '旁观者 · 过去' },
        { value: 'present:locals', label: '旁观者 · 现在' },
        { value: 'future:onlookers', label: '旁观者 · 未来' },
    ] },
    { label: '异世界', items: [
        { value: 'otherworld:title', label: '异世界 · 随机称号' },
        { value: 'otherworld:fandom', label: '异世界 · 同人' },
    ] },
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
    },
    present: {
        selves: '评论者是故事里出现过的、真实存在于剧情中的角色们，此刻正处于剧情发生的同一时间线上，是当场、实时的反应——不是事后回忆，而是正在经历这一切时的辩解、争吵、吐槽。',
        locals: '评论者是与主线角色同一时代、但没有直接卷入剧情的普通人、路人、网友，是了解这个世界背景设定的"自己人"，正在实时围观这段剧情的发生，反应更像真实网友的即时吃瓜、起哄、玩梗。',
    },
    future: {
        selves: '评论者是故事里出现过的真实角色们，但已经是许多年后的他们——是在回忆、反思，甚至试图翻案、否认、重新解释当年这段经历，语气里带着岁月沉淀后的复杂心态（可能懊悔，可能释怀，可能依然嘴硬）。',
        // onlookers 由 buildOnlookersText() 每次随机抽几种身份动态生成
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
评论者的网名要贴合该角色的性格/身份设计（可以中二、可以霸气、可以搞笑），并且必须在网名后面用括号标注这个角色的真实姓名，方便认出是谁，网名（by 属性）的写法例如：
<c n="1" by="疾风影帝（漩涡鸣人）">这忍术用得也太糙了吧……</c>
<c n="3" by="桃芝丽庄园主（罗宾）">有点意思，这段历史我要记下来。</c>
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

// 历史记录的分类粒度：时间方向 + 身份 +（同人模式下）随机/具体作品名 +（多帖论坛模式下）形式。
// 同人·指定作品 按作品名分别独立保存；同人·随机 不按作品细分，统一保存。
function getMemoryScopeKey(settings) {
    const direction = settings.timeDirection;
    const identity = settings.identity;
    const suffix = settings.forumMode === 'forum' ? ':forum' : ''; // 多帖论坛和评论区各记各的
    if (direction === 'otherworld' && identity === 'fandom') {
        const work = String(settings.fandomWork || '').trim();
        return (work ? `otherworld:fandom:${work}` : 'otherworld:fandom:random') + suffix;
    }
    return `${direction}:${identity}${suffix}`;
}

// 历史记录浏览：给你自己翻看的，保留最近几条完整原文，每次生成都会记录。
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

    // v0.20：身份合并。旧的"混合""未来网友/历史学者/后代/新闻"都并入"旁观者"
    const OLD_IDENTITY = { future: { forum: 'onlookers', historian: 'onlookers', descendants: 'onlookers', news: 'onlookers', mixed: 'onlookers' }, past: { mixed: 'locals' }, present: { mixed: 'locals' } };
    const migrated = OLD_IDENTITY[settings.timeDirection]?.[settings.identity];
    if (migrated) settings.identity = migrated;
    // v0.20：主题换新，旧主题名一律换成默认的极光
    if (!THEME_NAMES.includes(settings.theme)) settings.theme = 'aurora';

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

// 构思部分要求的最少字数（写进提示词；生成后也拿它来判断这次构思是不是偏短）
// 构思越深，后面的正文越舍得展开（实测构思三千多字时，正文能写到六千字），所以最低字数设得比较高
const PLAN_MIN_CHARS = { brief: 400, normal: 800, rich: 1400, epic: 2200 };

// 每档的"长短评分布"：short/mid/long 三种长度各自的字数范围，mix 是三者的占比
const LENGTH_TIERS = {
    brief:  { short: [20, 50], mid: [60, 110],  long: [120, 200], mix: [0.3, 0.5, 0.2] },
    normal: { short: [20, 50], mid: [70, 130],  long: [150, 260], mix: [0.3, 0.4, 0.3] },
    rich:   { short: [20, 50], mid: [80, 160],  long: [200, 350], mix: [0.2, 0.4, 0.4] },
    epic:   { short: [20, 60], mid: [100, 200], long: [250, 450], mix: [0.2, 0.3, 0.5] },
};

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

// 由代码给每一条主楼随机分配"长评/中评/短评"和具体字数，写成一张表交给AI照着写。
// 比"约四成是长评"这种笼统的比例更不容易被AI偷懒缩水成一两句话。
function buildLengthTable(count, richness) {
    const t = LENGTH_TIERS[richness] || LENGTH_TIERS.rich;
    const nShort = Math.round(count * t.mix[0]);
    const nLong = Math.round(count * t.mix[2]);
    const nMid = Math.max(0, count - nShort - nLong);
    const tiers = [
        ...Array(nShort).fill('short'),
        ...Array(nMid).fill('mid'),
        ...Array(nLong).fill('long'),
    ];
    const order = pickRandom(tiers, tiers.length); // 打乱，长评短评穿插
    const label = { short: '短评', mid: '中评', long: '长评' };
    return order.map((tier, i) => {
        const [lo, hi] = t[tier];
        const target = Math.round(randInt(lo, hi) / 10) * 10;
        return `第${i + 1}条主楼：${label[tier]}，约${target}字`;
    }).join('\n');
}

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
    '有人专门抬杠、揪字眼，纠结某个人的某句用词或前后说法，被别人嫌烦。',
    '有人认真复盘事件的前因后果，梳理时间线或因果链，并给出一个有风险的预测。',
    '有人情绪上头，语无伦次、反复追问、连发几个问号。',
    '有人吐槽某个人离谱的决定或尴尬的举动，并且说得很具体（把它当成真事，只评价人和事）。',
    '有人转述一个道听途说的传闻或小道消息（要明确标出是传闻，不当作事实）。',
    '有人旗帜鲜明地护着某个人，护短护得有点夸张，惹来别人调侃。',
    '有人发现某个人前后说法对不上的破绽，引发一阵惊叹或质疑（当成真实发生的事来质疑）。',
    '有人提出一个很现实、很务实的问题（比如代价、后勤、后果、谁来善后），把气氛从热闹拉回现实。',
];

// 有"讨论话题"时用这一套：围绕话题本身的各种发言姿态
const TOPIC_ANGLES = [
    '有人旗帜鲜明地站一方，并给出具体的理由。',
    '有人举出一个具体的例子或亲身经历来反驳对方。',
    '有人提出折中方案或第三种可能，被两边同时嫌弃。',
    '有人抬杠，揪住对方一个用词或前后矛盾。',
    '有人把话题引到一个很现实的代价或后果上。',
    '有人情绪上头，连续追问、语无伦次。',
    '有人跑题，被别人拉回来或者干脆被带歪。',
    '有人转述一个听来的说法（明确标出是传闻）。',
    '有人开玩笑缓和气氛，却不小心戳到了某个人的痛处。',
    '有人沉默了很久，最后丢下一句分量很重的话。',
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

// ==================== 同人资料（"同人加强"） ====================
// 生成前去公开的维基类网站查一下作品和角色的介绍，作为参考资料放进提示词，减少"毁人设"。
// 不调用AI，不额外花钱；只用浏览器能直接访问的维基接口（MediaWiki API，带 origin=* 的匿名请求允许跨域）。
// 查到的资料会缓存在本地"资料库"里，你也可以手动改写，手动写的优先级最高。
const FANDOM_SOURCES = [
    { key: 'zhwiki', name: '中文维基百科', api: 'https://zh.wikipedia.org/w/api.php', prio: 4 },
    { key: 'moegirl', name: '萌娘百科', api: 'https://zh.moegirl.org.cn/api.php', prio: 3 },
    { key: 'jawiki', name: '日文维基百科', api: 'https://ja.wikipedia.org/w/api.php', prio: 2 },
    { key: 'enwiki', name: '英文维基百科', api: 'https://en.wikipedia.org/w/api.php', prio: 1 },
];
const FANDOM_REF_MAX_CHARS = 4500;
const FANDOM_FETCH_TIMEOUT_MS = 8000;

async function wikiApi(api, params) {
    const url = new URL(api);
    const all = { format: 'json', origin: '*', ...params };
    for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FANDOM_FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url.toString(), { signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(timer);
    }
}

async function wikiSearchTitle(src, query, work) {
    const data = await wikiApi(src.api, { action: 'query', list: 'search', srsearch: query, srlimit: 5, srnamespace: 0 });
    const hits = data?.query?.search || [];
    if (!hits.length) return null;
    const exact = hits.find(h => String(h.title).includes(work));
    return (exact || hits[0]).title;
}

async function wikiExtract(src, title) {
    const data = await wikiApi(src.api, {
        action: 'query', prop: 'extracts', explaintext: 1, exsectionformat: 'wiki', titles: title, redirects: 1,
    });
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    return String(page?.extract || '');
}

// 从整篇文章里取出"角色/登场人物"那一节；没有就取开头的简介
function pickCharacterSection(extract) {
    const text = String(extract || '').replace(/\r/g, '');
    const headRe = /^==\s*(登场人物|登場人物|人物|角色|主要角色|主要人物|登场角色|登場キャラクター|キャラクター|Characters?|Main characters?|Cast)[^=\n]*==\s*$/im;
    const m = headRe.exec(text);
    let body = '';
    if (m) {
        const rest = text.slice(m.index);
        const next = rest.slice(m[0].length).search(/^==[^=\n]/m);
        body = next >= 0 ? rest.slice(0, m[0].length + next) : rest;
    } else {
        body = text.slice(0, 1800);
    }
    return body
        .replace(/\[\d+\]/g, '')
        .replace(/^=+\s*(.*?)\s*=+\s*$/gm, '【$1】')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function fetchFromOneSource(src, work) {
    const mainTitle = await wikiSearchTitle(src, work, work);
    if (!mainTitle) return { src, text: '', title: '' };
    let text = pickCharacterSection(await wikiExtract(src, mainTitle));
    let title = mainTitle;
    // 主条目里没有足够的角色介绍时，再找一下"角色列表"之类的条目
    if (text.length < 900) {
        const listQuery = src.key === 'jawiki' ? `${work} 登場人物` : src.key === 'enwiki' ? `List of ${work} characters` : `${work} 角色列表`;
        try {
            const listTitle = await wikiSearchTitle(src, listQuery, work);
            if (listTitle && listTitle !== mainTitle) {
                const more = pickCharacterSection(await wikiExtract(src, listTitle));
                if (more.length > text.length) { text = more; title = listTitle; }
            }
        } catch { /* 找不到列表条目就算了 */ }
    }
    return { src, text, title };
}

// 去网上查（并行问几个站，8 秒超时），挑最好的一份
async function fetchFandomFromWeb(work) {
    const results = await Promise.allSettled(FANDOM_SOURCES.map(src => fetchFromOneSource(src, work)));
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.text.length >= 200).map(r => r.value);
    if (!ok.length) {
        const failed = results.filter(r => r.status === 'rejected').length;
        return { text: '', source: '', note: failed === results.length ? '联网失败（所有站点都没连上）' : '没有搜到这个作品的资料' };
    }
    ok.sort((a, b) => (b.text.length >= 800) - (a.text.length >= 800) || b.src.prio - a.src.prio || b.text.length - a.text.length);
    const best = ok[0];
    let text = best.text;
    let source = `${best.src.name}「${best.title}」`;
    if (text.length < 1500 && ok[1]) {
        text += `\n\n【补充：${ok[1].src.name}「${ok[1].title}」】\n${ok[1].text}`;
        source += `、${ok[1].src.name}`;
    }
    if (text.length > FANDOM_REF_MAX_CHARS) text = text.slice(0, FANDOM_REF_MAX_CHARS) + '……';
    return { text, source, note: '已联网查询' };
}

function getFandomLibrary() {
    const settings = getSettings();
    if (!settings.fandomLibrary || typeof settings.fandomLibrary !== 'object') settings.fandomLibrary = {};
    return settings.fandomLibrary;
}

// 生成前调用：先看本地资料库，没有再联网查（并存进资料库）
async function getFandomReference(settings) {
    const work = String(settings.fandomWork || '').trim();
    if (!work) return { text: '', source: '', note: '没有填作品名，没法查资料' };
    const lib = getFandomLibrary();
    const entry = lib[work];
    if (entry && entry.text) {
        return {
            text: String(entry.text).slice(0, 6000),
            source: entry.manual ? '你手动写的资料库' : (entry.source || '本地资料库'),
            note: entry.manual ? '手动资料' : '本地缓存',
        };
    }
    const fetched = await fetchFandomFromWeb(work);
    if (fetched.text) {
        lib[work] = { text: fetched.text, source: fetched.source, time: Date.now(), manual: false };
        saveSettings();
    }
    return fetched;
}

// ==================== 当事人视角：出场角色名册 ====================
// 当事人视角下，AI要先在构思里列出"剧情里真正出场的角色"，发言者只能从中选。
// 显示时，如果某条发言的网名不在名册里（也不是酒馆里的角色名），就隐藏它。
// 名册解析不出来、或者会隐藏超过七成内容时，不做任何过滤。

// 名册写进历史记录的方式：一个看不见的 <roster> 标签（解析时会被忽略）
function extractRosterFromPlan(planText) {
    const lines = sectionLines(String(planText || ''), '【出场角色名册】');
    if (!lines) return [];
    const names = [];
    for (const line of lines) {
        const cleaned = line.replace(/^\s*(?:\d+[.、)）]|[-•·●])\s*/, '').trim();
        const first = cleaned.split(/[｜|:：（(，,、\s]/)[0].trim();
        if (first && first.length <= 12 && !names.includes(first)) names.push(first);
    }
    return names;
}

function getRosterFromText(raw) {
    const text = String(raw ?? '');
    const tag = text.match(/<roster>([^<]*)<\/roster>/);
    let names = tag ? tag[1].split(/[、,，\n]/).map(x => x.trim()).filter(Boolean) : extractRosterFromPlan(extractPlanText(text));
    if (!names.length) return [];
    try {
        const ctx = getContext();
        for (const n of [ctx.name1, ctx.name2]) {
            const t = String(n || '').trim();
            if (t && !names.includes(t)) names.push(t);
        }
    } catch { /* 取不到就算了 */ }
    return names;
}

function baseName(name) {
    return String(name ?? '').replace(/[（(].*$/, '').trim();
}

function nameInRoster(name, roster) {
    const b = baseName(name);
    if (!b) return false;
    return roster.some(r => r === b || (r.length >= 2 && b.includes(r)) || (b.length >= 2 && r.includes(b)));
}

function filterThreadBy(thread, shouldDrop) {
    const keptRoots = [];
    const keep = new Set();
    for (const root of thread.roots) {
        if (shouldDrop(root.name)) continue;
        root.children = root.children.filter(c => !shouldDrop(c.name));
        keptRoots.push(root);
        keep.add(root);
        root.children.forEach(c => keep.add(c));
    }
    const flat = thread.flat.filter(x => keep.has(x));
    return { roots: keptRoots, flat, count: flat.length };
}

function applyCastFilter(parsed, roster) {
    const drop = (name) => !nameInRoster(name, roster);
    let total = 0;
    let dropped = 0;
    let out;
    if (parsed.mode === 'forum') {
        const posts = [];
        for (const p of parsed.posts) {
            total += 1 + p.count;
            if (drop(p.name)) { dropped += 1 + p.count; continue; }
            const th = filterThreadBy(p, drop);
            dropped += p.count - th.count;
            posts.push({ ...p, ...th });
        }
        out = { ...parsed, posts, count: posts.reduce((a, p) => a + p.count + 1, 0) };
    } else {
        total = parsed.flat.length;
        const th = filterThreadBy(parsed, drop);
        dropped = total - th.count;
        out = { ...parsed, ...th };
    }
    if (total === 0 || dropped === 0) return { parsed, dropped: 0 };
    if (dropped > total * 0.7) return { parsed, dropped: 0 }; // 会误删太多：多半是名册解析得不对，不过滤
    return { parsed: out, dropped };
}

// ==================== 多帖论坛模式（规格） ====================
// 评论区模式：围绕这一段剧情的一个评论区。
// 多帖论坛模式：一次生成好几个不同主题的帖子（版块、标题、楼主正文、各自的回复），点进帖子才看到回复。
// 一次调用生成更多内容，所以按次计费时更划算，但需要更大的"最大输出长度"。
const FORUM_MODE_OPTIONS = [
    { value: 'thread', label: '评论区（一个帖子）' },
    { value: 'forum', label: '多帖论坛（帖子列表）' },
];

const FORUM_SPECS = {
    brief:  { posts: [3, 4],  comments: [2, 5],  body: [60, 120],  cmt: [30, 100] },
    normal: { posts: [4, 6],  comments: [3, 7],  body: [80, 180],  cmt: [40, 140] },
    rich:   { posts: [5, 8],  comments: [4, 9],  body: [100, 260], cmt: [50, 200] },
    epic:   { posts: [6, 9],  comments: [5, 10], body: [150, 350], cmt: [60, 260] },
};

const POST_TYPES_PLOT = [
    '事件讨论（刚发生的某件大事）',
    '细节考据（抓一个很小的细节认真分析）',
    '人物吐槽（某个人这波操作）',
    '预测后续（接下来会怎样）',
    '求助提问（有人没弄明白某件事）',
    '争议投票（A还是B，吵起来）',
    '复盘总结（梳理前因后果）',
];
const POST_TYPES_WORLD = [
    '世界冷知识/科普（和这个世界有关）',
    '八卦传闻（必须明确标出是传闻）',
    '同人脑洞/段子（和这个世界有关）',
    '论坛日常（水帖、签到、吐槽论坛本身，但要带这个世界的色彩）',
    '经验/攻略（这个世界里的人会关心的实用话题）',
];
const POST_TYPES_TOPIC = [
    '立场帖（鲜明表态并给出理由）',
    '提问帖（抛出一个与话题相关的具体疑问）',
    '举例帖（用具体的经历或例子来论证）',
    '反驳帖（针对某个常见观点逐条反驳）',
    '折中帖（提出第三种看法）',
    '吐槽帖（带着情绪讨论这个话题）',
    '复盘帖（梳理这个话题的来龙去脉）',
];

function pickCycle(list, n) {
    const out = [];
    while (out.length < n) out.push(...pickRandom(list, Math.min(list.length, n - out.length)));
    return out;
}

// 由代码给每个帖子分配：类型、热度、楼主正文字数、回复条数。比让AI自己决定更不容易千篇一律或缩水。
// kind: 'mixed' 约六成围绕事件、四成世界里的其他话题；'plot' 全部围绕事件；'topic' 全部围绕用户指定的话题
function buildPostTable(count, richness, kind = 'mixed') {
    const f = FORUM_SPECS[richness] || FORUM_SPECS.rich;
    let types;
    if (kind === 'topic') {
        types = pickCycle(POST_TYPES_TOPIC, count);
    } else if (kind === 'plot') {
        types = pickCycle(POST_TYPES_PLOT, count);
    } else {
        const plotN = Math.max(1, Math.round(count * 0.6));
        types = [...pickCycle(POST_TYPES_PLOT, plotN), ...pickCycle(POST_TYPES_WORLD, count - plotN)];
    }
    types = pickRandom(types, count);
    const hotN = Math.max(1, Math.round(count * 0.3));
    const coldN = count >= 4 ? Math.max(1, Math.round(count * 0.2)) : 0;
    const heats = pickRandom([
        ...Array(hotN).fill('热帖'),
        ...Array(coldN).fill('冷帖'),
        ...Array(Math.max(0, count - hotN - coldN)).fill('普通帖'),
    ], count);
    const [cMin, cMax] = f.comments;
    const mid = Math.ceil((cMin + cMax) / 2);
    return types.map((type, i) => {
        const heat = heats[i];
        const replies = heat === '热帖' ? randInt(mid, cMax) : heat === '冷帖' ? randInt(0, 2) : randInt(cMin, mid);
        const body = Math.round(randInt(f.body[0], f.body[1]) / 10) * 10;
        const longLen = Math.round(randInt(Math.round(f.cmt[1] * 0.6), f.cmt[1]) / 10) * 10;
        const shortHi = Math.max(f.cmt[0] + 10, Math.round(f.cmt[1] * 0.4 / 10) * 10);
        const note = replies >= 4
            ? `，其中1～2条写长一点（约${longLen}字），其余约${f.cmt[0]}～${shortHi}字`
            : replies > 0 ? `，每条约${f.cmt[0]}～${shortHi}字` : '';
        return `第${i + 1}帖｜${type}｜${heat}｜楼主正文约${body}字｜回复约${replies}条${note}`;
    }).join('\n');
}

// ==================== 提示词的各个组成部分 ====================

// 沉浸规则：评论者把一切当作真实发生过的事，不许跳出来评价"这是个故事"
const IMMERSION_BLOCK = `【沉浸规则——一律把这些事当成真的已经发生过的事】
- 所有发言者都身处这个世界之中，把剧情里的一切当作真实发生过的事件来讨论，只评价“人和事”：谁做了什么、为什么、值不值、后果如何。
- 严禁跳出事件本身去评价“这是一个故事”：不得出现“作者”“编剧”“读者”“水字数”“剧情杀”“设定崩了”“降智”“机械降神”“工具人”“文笔”“这是小说/剧本”之类的话，也不得吐槽“剧情”“设定”本身，更不得用“这不符合物理定律/科学/常理/逻辑”“太扯了”这种方式质疑事件本身能不能成立。
- 对离谱的事，可以惊讶、质疑、嘲笑某个人的行为或某个人的说法，但要站在“这件事真的发生了”的前提上（例如“他怎么敢这么干”“这种伤他居然还能撑住，是不是用了什么手段”），而不是质疑这件事能不能被写出来。
- 角色之间对人物选择的争论、“这步棋太险了”这类世界之内的评价，照常允许。`;

function buildTopicBlock(topic, isForum) {
    if (!topic) return '';
    return `\n\n【讨论话题——所有发言都围绕它展开】
本次的讨论话题是：「${topic}」
- 所有${isForum ? '帖子和回复' : '评论'}都要围绕这个话题展开：赞同、反对、补充、质疑、举例、被带跑题后又被拉回来都可以，但不能无视话题去讨论别的事。
- 剧情片段只作为背景和论据，发言者可以引用剧情里的具体细节来支持自己的立场。
- 发言者的立场要有分歧，不要全员同一种看法。${isForum ? '\n- 每个帖子是这个话题的一个不同切入角度，标题要体现这个角度。' : ''}`;
}

// 当事人视角：只有剧情里实际出场的人能发言
function buildCastBlock(isForum, castNames) {
    const hint = castNames.length
        ? `\n- 酒馆里记录的角色名：${castNames.join('、')}（如果他们在这段剧情里确实出场，可以作为发言者）。`
        : '';
    return `\n\n【发言者限定——只有故事里出场的当事人能发言】
- 所有发言者只能是剧情片段里实际出场的角色（有名字或明确称呼的人）。严禁编造路人、网友、围观群众、旁白，或任何剧情里没有出现过的人。
- 出场的人可能很少，甚至只有一两位：这完全没问题。一个人可以连续发很多条，对很多件事分别做出回应，也可以自己跟自己争论、前后自我反驳。不要为了凑人数而增加发言者。${hint}
- 发言者的${isForum ? '网名（by 属性）' : '网名'}直接写角色的名字，不要加称号。${isForum ? '\n- 所有帖子都必须围绕这段经历本身，不要出现“世界里的其他话题”“论坛日常”这类与当事人无关的帖子。' : ''}`;
}

function buildProtagonistBlock(settings, protagonist, isForum, noReplies) {
    if (!protagonist) return '';
    if (settings.protagonistMode) {
        return `\n\n【主角参与】\n故事的主角「${protagonist}」本人也混在${isForum ? '这个论坛' : '评论者'}里。要求：\n- 他的网名直接写「${protagonist}」，用符合他性格的口吻发言。\n- 全场他最多发言 2 次（${isForum ? '发帖和回复' : '主楼和跟帖'}合计），而且不能连续两次都是他。\n- 每次发言二选一：发表自己对这件事的感想；或者回复${isForum ? '某个帖子里' : '论坛里'}某个具体的人${noReplies ? '（此载体没有跟帖，直接在内容里点名对方）' : '（用 to 属性指明回复的是哪一条）'}。${isForum ? '他自己发帖也行，但最多一个。' : ''}\n- 不要每条都去回复，也不要让他一次性刷好几条。他的发言不会改变主线剧情。`;
    }
    return `\n\n【主角回避】\n故事的主角是「${protagonist}」。${isForum ? '论坛里不得出现主角本人（既不能发帖也不能回复）' : '评论者里不得出现主角本人'}，也不要以他的身份或口吻发言；需要提到他时，只能以第三方的口吻谈论他。`;
}

// 未来·旁观者：每次随机抽几种"后世人"的身份混着来，免得一成不变
const ONLOOKER_FLAVORS = [
    '未来网络论坛上的普通网友、吃瓜群众、历史爱好者，互相评论、吐槽、争论',
    '未来的历史学者、研究者，讨论史料、因果、评价与争议，语气更严谨但也可以有派系分歧',
    '当事人的后代，看到祖先这段历史后的吐槽、尴尬、骄傲或争论',
    '未来新闻节目里的主持人、记者、专家，评述这段历史',
];

function buildOnlookersText() {
    const picks = pickRandom(ONLOOKER_FLAVORS, 3);
    return `评论者是很久以后的人，在回望这段已经成为历史的事。本次出场的身份有：\n${picks.map(p => `- ${p}`).join('\n')}\n具体每条发言是哪一类由你自由分配，各类人的视角和语气要有区别。`;
}

// 同人资料块（有资料才加）
function buildFandomRefBlock(ref) {
    const rules = '- 发言角色必须是资料里出现过的、或你确信属于该作品的角色；性格、口头禅、人物关系、能力与身份必须符合资料，不要让角色说出不符合其人设的话；拿不准的角色宁可不用。';
    if (ref && ref.text) {
        return `\n\n【原作资料（来自${ref.source || '资料库'}，用来核对人设；不要照抄，也不要把资料当成发生在这段剧情里的事）】\n${ref.text}\n${rules}`;
    }
    return `\n\n【同人角色要求】\n${rules}`;
}

// 构思模板：不同情况下小标题略有不同
function buildPlanSections(o) {
    const heads = [];
    heads.push(o.topic
        ? ['【可讨论的角度】', '围绕话题，列出至少8个可以展开的论点、例子或反例，每条写明可以引用剧情里哪个具体细节。']
        : ['【可讨论的细节】', '至少8条，每条写明是剧情里哪一句话/哪个动作/哪件物品，以及它能引出什么讨论。']);
    if (o.isForum) {
        heads.push(['【帖子策划】', '按上面的帖子分配表，为每个帖子各写一行：第几帖｜版块｜标题（要像真实论坛标题，可以标题党）｜楼主网名与身份｜楼主想说的 2～3 个要点｜这个帖子下会吵起来的点。']);
    }
    if (o.selves) {
        heads.push(['【出场角色名册】', '只列剧情片段里真正出场的角色，每人一行：名字｜他在这段经历里做了什么｜他此刻的情绪与立场｜他大概会发几条。不许出现剧情里没有的人；人少没关系，一个人可以发很多条。']);
    } else {
        heads.push(['【评论者名单】', `${o.personaMin}～${o.personaMax} 位，每位一行：网名｜身份｜立场｜说话习惯｜最在意的点。要彼此差异明显，包括立场对立的人。${o.isForum ? '同一位评论者可以在不同帖子里反复出现（网名和人设要保持一致）。' : ''}`]);
    }
    if (o.fandom) {
        heads.push(['【角色设定回顾】', '为每位将要发言的角色各写几句：他在原作里的身份与性格、说话的口癖、与其他发言角色的关系、此刻处在原作的哪个阶段。后面的发言必须符合这里写的设定。']);
    }
    heads.push(o.isForum
        ? ['【互动线】', '每个帖子里谁会反驳谁、谁会接谁的梗、谁会把话题带偏。']
        : ['【争论线与互动】', `至少3条会吵起来的争论线，几个跑题/玩梗/脑补点，以及${o.noReplies ? '谁会接谁的梗' : '楼中楼里谁会接谁的话'}。`]);
    if (o.useLengthTable) {
        heads.push(['【逐楼提纲】', '按上面的字数分配表，为每一条主楼各写一行：第几条｜网名｜针对剧情里哪个具体细节｜立场｜准备说的 2～3 个要点（长评要写出论证的层次，说清先说什么、再说什么、最后落在哪）。']);
    }
    heads.push(['【焦点核对】', '逐条核对上面"本次讨论焦点"是否都安排进去了，没有就补上。']);
    return heads;
}

function buildPlanBlock(o) {
    if (!o.planFirst) return { text: '', headings: [] };
    const heads = buildPlanSections(o);
    const text = `\n\n【写作步骤——分两步】
第一步：先输出 <构思> 和 </构思> 两个标签之间的构思。这部分程序会自动删掉、读者看不到，所以请写得充分、具体，不要偷懒：构思部分不少于 ${o.planMin} 字，绝对不能只写一两句话。请按下面的小标题逐项填写（构思里可以不遵守输出格式）：
<构思>
${heads.map(([h, d]) => `${h}${d}`).join('\n')}
</构思>
第二步：构思结束后，紧接着输出${o.isForum ? '所有帖子' : '论坛正文'}，严格使用上面的输出格式。`;
    return { text, headings: heads.map(([h]) => h) };
}

function buildThreadFormatBlock(skin, hotOn) {
    const likeAttr = (v) => (hotOn ? ` like="${v}"` : '');
    const lines = skin.noReplies
        ? [`<c n="1" by="某某"${likeAttr(128)}>……</c>`, `<c n="2" by="某某"${likeAttr(9)}>……</c>`, `<c n="3" by="某某"${likeAttr(2315)}>……</c>`]
        : [`<c n="1" by="某某"${likeAttr(128)}>……</c>`, `<c n="2" by="某某"${likeAttr(9)}>……</c>`, `<c n="3" to="2" by="某某"${likeAttr(2315)}>……</c>`, `<c n="4" to="3" by="某某"${likeAttr(41)}>……</c>`, `<c n="5" by="某某"${likeAttr(0)}>……</c>`];
    return `【输出格式——必须严格遵守，程序靠这个格式识别楼层】
每条评论用一对 <c> 标签包起来，格式固定为：
主楼：<c n="楼层编号" by="网名"${hotOn ? ' like="赞数"' : ''}>评论内容</c>${skin.noReplies ? '' : `\n跟帖：<c n="楼层编号" to="被回复的楼层编号" by="网名"${hotOn ? ' like="赞数"' : ''}>评论内容</c>`}
示例：
${lines.join('\n')}
- n 从1开始连续递增${skin.noReplies ? '' : '，主楼和跟帖共用同一个编号序列；跟帖的 to 填它回应的那一楼的编号（可以是主楼，也可以是另一条跟帖）。被回复的编号只能写在 to 属性里，不要把“to 3楼”“回复3楼”这类文字写进评论内容里'}。
${hotOn ? '- 赞数是纯整数。分布要像真实论坛：少数楼层赞数很高（几百到几千），大多数只有个位数到几十，个别是0；赞数要和评论的质量、争议度、梗的好笑程度相符——吵得凶的、有洞察的、有梗的更高；跟帖的赞数一般比主楼低。\n' : ''}- 属性值一律用英文双引号，网名里不要出现双引号和 < > 符号；评论内容里不要出现 </c> 这样的标签文字。
- 评论内容可以分段换行，但必须全部写在这一对 <c> 标签里面。
- 除了这些标签，不要输出任何别的东西：不要开场白、不要分隔线、不要结尾说明、不要Markdown符号、不要加粗。`;
}

function buildForumFormatBlock(hotOn) {
    const ex = (v) => (hotOn ? ` like="${v}"` : '');
    return `【输出格式——必须严格遵守，程序靠这个格式识别帖子和楼层】
论坛由多个帖子组成，每个帖子用 <post> 标签包起来，结构固定如下：
<post id="1" board="版块名" by="楼主网名"${ex(256)}>
<title>帖子标题</title>
<body>楼主正文</body>
<c n="1" by="网名"${ex(31)}>回复内容</c>
<c n="2" to="1" by="网名"${ex(4)}>回复内容（被回复的编号只写在 to 属性里，内容里不要再写“to 1楼”）</c>
</post>
- 帖子之间不要写任何别的文字。每个帖子的回复编号 n 从 1 开始连续递增（每个帖子重新从 1 算起）；to 只在回复某一条回复时才写，填被回复那一条的编号（可以是楼主下的第一层回复，也可以是另一条跟帖）。
- 版块名由你根据这个世界观自拟（比如考据区、八卦区、水区、吵架区之类，不要叫“剧情区”“小说区”），同一个版块可以出现多次。
${hotOn ? '- 赞数是纯整数，帖子和回复都要标。分布要像真实论坛：热帖几百到几千，普通帖几十，冷帖个位数；回复的赞数一般比帖子低，吵得凶的、有梗的、有洞察的更高。\n' : ''}- 属性值一律用英文双引号，网名和标题里不要出现双引号和 < > 符号；正文和回复里不要出现 </c>、</post> 这样的标签文字。
- 楼主正文和回复内容可以分段换行，但必须全部写在对应的标签里面。
- 除了这些标签，不要输出任何别的东西：不要开场白、不要分隔线、不要结尾说明、不要Markdown符号、不要加粗。`;
}

// ==================== 总装：构造完整提示词 ====================
async function buildPrompt(story) {
    const settings = getSettings();
    const isForum = settings.forumMode === 'forum';
    const direction = DIRECTION_TEXT[settings.timeDirection] ? settings.timeDirection : 'future';
    const identity = settings.identity;
    const selves = identity === 'selves' && direction !== 'otherworld'; // 当事人视角：只有剧情里出场的人能发言
    const fandom = direction === 'otherworld' && identity === 'fandom';
    const topic = String(settings.topic || '').trim().slice(0, 200);
    const spec = getRichnessSpec(settings);
    const skin = isForum ? SKIN_SPECS.forum : getSkinSpec(settings);
    const protagonist = getProtagonistName();
    const hotOn = isForum ? !!settings.hotComments : (!!settings.hotComments && skin.hotAllowed);
    const [personaMin, personaMax] = spec.personas;
    const angles = pickRandom(topic ? TOPIC_ANGLES : DISCUSSION_ANGLES, spec.angles);
    const voices = pickRandom(VOICE_STYLES, 5);
    const planMin = PLAN_MIN_CHARS[settings.richness] || PLAN_MIN_CHARS.rich;
    const planFirst = settings.planFirst !== false;

    // 身份说明
    let identityText;
    if (fandom) {
        identityText = buildFandomIdentityText(settings.fandomWork, settings.fandomSameWorld);
    } else if (direction === 'future' && identity === 'onlookers') {
        identityText = buildOnlookersText();
    } else {
        const identityTable = IDENTITY_TEXT[direction] || IDENTITY_TEXT.future;
        identityText = identityTable[identity] || Object.values(identityTable)[0];
    }

    // 同人加强：生成前查资料（失败不影响生成，只是少一份参考）
    let fandomRef = { text: '', source: '', note: '' };
    if (fandom && settings.fandomBoost) {
        try {
            fandomRef = await getFandomReference(settings);
        } catch (e) {
            console.warn('[观察者论坛] 查同人资料失败：', e);
            fandomRef = { text: '', source: '', note: '查资料出错' };
        }
    }

    const worldInfoText = settings.worldInfoEnabled !== false ? await getWorldInfoText() : '';
    const worldInfoBlock = worldInfoText
        ? `\n【世界设定参考】（背景知识，不是新发生的剧情，仅用于帮助理解剧情里的名词和背景）\n${worldInfoText}\n`
        : '';

    let castNames = [];
    try {
        const ctx = getContext();
        castNames = [ctx.name1, ctx.name2].map(x => String(x || '').trim()).filter(Boolean)
            .filter(n => settings.protagonistMode || !protagonist || n !== protagonist); // 没开"主角参与"时，主角不能发言，就别当成可选发言者
    } catch { /* 取不到就不提示 */ }

    const protagonistBlock = buildProtagonistBlock(settings, protagonist, isForum, skin.noReplies);
    const topicBlock = buildTopicBlock(topic, isForum);
    const castBlock = selves ? buildCastBlock(isForum, castNames) : '';
    const fandomBlock = fandom ? buildFandomRefBlock(fandomRef) : '';
    const angleText = angles.map((a, i) => `${i + 1}. ${a}`).join('\n');
    const voiceText = voices.map(v => `- ${v}`).join('\n');

    // 公共的"严格规则"
    const rule5 = topic
        ? `大家围绕上面的“讨论话题”展开，剧情只作背景和论据。`
        : (isForum
            ? (selves
                ? '所有帖子都直接围绕这段经历中真正发生的事件、人物行为和结果。'
                : '大约六成的帖子直接围绕这段剧情中真正发生的事件、人物行为和结果；其余帖子是这个世界里与之相关的其他话题或论坛日常，要和这个世界观相容。')
            : '评论重点放在这段剧情中真正发生的事件、人物行为和结果。');
    const rule6 = selves
        ? '发言者只能是剧情里出场的当事人（见“发言者限定”）。'
        : '除非身份设定限定了发言者的范围，否则发言者之间身份要有明显差异。';
    const who = isForum ? '帖子和评论' : '评论';

    // 计划 / 格式 / 数量
    let planOpts = { planFirst, planMin, isForum, topic: !!topic, selves, fandom, personaMin, personaMax, noReplies: skin.noReplies, useLengthTable: false };
    let formatBlock;
    let quantityBlock;
    let reminder;
    let closing;

    if (isForum) {
        const f = FORUM_SPECS[settings.richness] || FORUM_SPECS.rich;
        const postCount = randInt(f.posts[0], f.posts[1]);
        const table = buildPostTable(postCount, settings.richness, topic ? 'topic' : (selves ? 'plot' : 'mixed'));
        formatBlock = buildForumFormatBlock(hotOn);
        quantityBlock = `【数量与分配】
- 生成 ${postCount} 个帖子。下面是程序随机分配的帖子分配表，请严格按表写：类型、热度、楼主正文字数、回复条数都要达到，标"热帖"的要热闹（回复多、有人吵起来），标"冷帖"的就是没几个人理。每个帖子的回复要有长有短，不要都是一两句话。帖子的先后顺序就按表里的顺序。
${table}`;
        reminder = '（格式提醒：全部内容必须用 <post>…</post> 包住每个帖子，帖子里用 <title>、<body> 和 <c>…</c> 标签，不要改成别的写法，不要写到中途换成“网名：内容”这样的格式。）';
        closing = '【观察者论坛】';
        lastPromptMeta = { mode: 'forum', postCount, postTable: table };
    } else {
        const floorMin = Math.max(5, Math.round(spec.floors[0] * skin.floorMul));
        const floorMax = Math.max(floorMin, Math.round(spec.floors[1] * skin.floorMul));
        const replyMin = skin.noReplies ? 0 : Math.max(1, Math.round(spec.replies[0] * skin.replyMul));
        const replyMax = skin.noReplies ? 0 : Math.max(replyMin, Math.round(spec.replies[1] * skin.replyMul));
        const floorCount = randInt(floorMin, floorMax); // 这一次具体要写多少条主楼，由代码定，不让AI自己挑
        const replyCount = skin.noReplies ? 0 : randInt(replyMin, replyMax);
        const useLengthTable = !skin.lengthText;
        const lengthTable = useLengthTable ? buildLengthTable(floorCount, settings.richness) : '';
        planOpts = { ...planOpts, useLengthTable };
        formatBlock = buildThreadFormatBlock(skin, hotOn);
        quantityBlock = `【数量与长度】
- 生成 ${floorCount} 条主楼评论${skin.noReplies ? '' : `；另外再写 ${replyCount} 条左右的楼中楼跟帖（跟帖不算在主楼数量里）`}。
${useLengthTable
    ? `- 下面是程序随机分配的字数分配表，请严格按表写每一条主楼：标"长评"的必须真的写到约定字数（有具体论证、细节、前因后果，不能用一两句话敷衍），只有标"短评"的才可以一两句话。主楼的发布顺序就按表里的顺序。
${lengthTable}
- 跟帖以一两句话为主（20～80字），其中 1～2 条可以展开写（100～200字）。`
    : `- 字数安排：${skin.lengthText}。`}`;
        reminder = '（格式提醒：论坛正文必须全部用 <c n=… by=…>…</c> 标签写，不要改成别的写法，不要写到中途换成“网名：内容”这样的格式。）';
        closing = '【观察者评论】';
        lastPromptMeta = { mode: 'thread', floorCount, replyCount, lengthTable: useLengthTable ? lengthTable : '' };
    }

    const plan = buildPlanBlock(planOpts);
    Object.assign(lastPromptMeta, {
        richness: settings.richness, storyChars: story.length, planMin, personaMin, personaMax,
        angles: angles.slice(), voices: voices.slice(), planHeadings: plan.headings,
        selves, topic, fandom, fandomRefChars: fandomRef.text.length, fandomRefSource: fandomRef.source || '', fandomRefNote: fandomRef.note || '',
    });

    const tail = planFirst
        ? `${plan.text}\n\n${reminder}\n\n现在开始。先完成第一步（构思），写完构思再接着写${isForum ? '所有帖子' : '论坛正文'}：\n<构思>`
        : `${reminder}\n\n${closing}`;

    const intro = isForum
        ? '请把下面的剧情片段视为已经/正在/即将发生（具体哪种，参照上面的时间背景判断）的事，生成一个与当前主线完全分离的"观察者论坛"：它不是单一的评论区，而是一个有多个帖子的论坛首页。'
        : '请把下面的剧情片段视为已经/正在/即将发生（具体哪种，参照上面的时间背景判断）的事，生成一段与当前主线完全分离的"观察者论坛"评论区。';

    return `你是"观察者论坛"。

【时间背景】
${DIRECTION_TEXT[direction]}

【评论者身份】
${identityText}${fandomBlock}
${!isForum && skin.promptText ? '\n' + skin.promptText + '\n' : ''}
${intro}

【严格规则】
1. 这不是主线续写，不得继续当前剧情。
2. 这${isForum ? '个论坛' : '些评论'}不会被当前任何角色看到，不得改变当前世界状态。
3. 不得把${who}中的推测当成事实，也不得凭空补充关键剧情${isForum ? '；传闻、八卦必须明确标出是传闻' : ''}。
4. 可以出现误解、争论、玩梗、不同立场；发言者可以理解错，但不要让所有人都同一种看法。
5. ${rule5}
6. ${rule6}
7. 不要出现"作为AI""提示词""主线"等元话语。
8. 最后不要总结，不要解释生成过程。

${IMMERSION_BLOCK}${topicBlock}${castBlock}

${quantityBlock}

【质量要求——避免千篇一律】
${isForum ? '- 每个帖子的标题要像真实论坛里会有的标题，各不相同，不要都是"关于……的讨论"。\n' : ''}- 每${isForum ? '个帖子和回复' : '条评论'}至少抓住一个具体细节（人名、物品、台词、动作、数字、地点），不要空泛地评价。
- 不要每条都走"先复述剧情→再表态→再总结升华"的三段式；不要用"这或许就是……""这正是……的意义"这类金句或升华来收尾；少用排比、对仗这类整齐的句子。
- 每位发言者要有自己的说话习惯、关心的点和立场，不要所有人用同样的句式和语气。
${isForum ? '- 帖子下面要有互动：有人点名反驳、有人接梗、有人被带偏，还可以出现回复回复。' : (skin.noReplies ? '- 评论者之间要有呼应：有人接梗、有人跟风复读、有人被带偏。' : '- 评论者之间要有互动：有人点名反驳、有人接梗、有人被带偏。热门楼层可以有 2～4 条跟帖，还可以出现跟帖回复跟帖；冷门楼层可以没人理。')}
- 同一个开头词或口头禅，整个论坛里最多出现两次。
- 像真人打字：允许跑题、半截话、反问、省略号，但不要刻意卖弄。${protagonistBlock}

【本次讨论焦点——由程序随机指定，务必每一条都有人谈到】
${angleText}

【本次语言风格参考——挑几种分配给不同发言者，按身份适配，不必全用】
${voiceText}

${formatBlock}
${worldInfoBlock}
【剧情片段】
${story}

${tail}`;
}

// ==================== 诊断报告 ====================
// 每次生成都会自动记录一份诊断报告：用了什么设置、提示词里随机抽到了什么、请求各阶段花了多久、
// 模型有没有输出"思考"字段、怎么结束的、构思写了多少、正文写了多少、实际字数和分配表差多少……
// 表现好和表现差的时候各复制一份发出来对比，就能看出区别在哪。
// 报告里不含API密钥；默认不含提示词全文和剧情原文（在设置里可以选择包含）。
const PLUGIN_VERSION = '0.20.0';
const DIAG_STORE_KEY = 'future_observer_diag_reports';
const DIAG_MAX_REPORTS = 6;
let lastPromptMeta = null; // buildPrompt 每次会把"这次随机抽到了什么"记在这里

let diagReports = (() => {
    try {
        const j = JSON.parse(localStorage.getItem(DIAG_STORE_KEY) || '[]');
        return Array.isArray(j) ? j : [];
    } catch {
        return [];
    }
})();

function saveDiagReports() {
    try {
        let list = diagReports.slice(-DIAG_MAX_REPORTS);
        let json = JSON.stringify(list);
        while (json.length > 1500000 && list.length > 1) {
            list = list.slice(1);
            json = JSON.stringify(list);
        }
        diagReports = list;
        localStorage.setItem(DIAG_STORE_KEY, json);
    } catch { /* 存不下就算了，内存里还有 */ }
}

function addDiagReport(text, label) {
    diagReports.push({ time: Date.now(), label, text });
    saveDiagReports();
    refreshDiagUI();
}

// 复制到剪贴板。手机上酒馆常常是 http 访问，剪贴板接口会被浏览器禁用，所以准备了备用办法
async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 走备用办法 */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
    } catch {
        return false;
    }
}

function newMetrics() {
    return {
        t0: performance.now(),
        tHeaders: null, tFirstChunk: null, tFirstContent: null, tFirstReasoning: null,
        tPlanEnd: null, tFirstBody: null, tEnd: null,
        mode: null, httpStatus: null, chunks: 0, bytes: 0,
        maxGap: 0, maxGapAt: 0, lastChunkAt: null,
        keepAlive: 0, otherLines: 0, emptyDeltas: 0,
        contentChars: 0, reasoningChars: 0, deltaKeys: new Set(),
        finishReason: null, usage: null, model: null, id: null,
        headers: {}, timeline: [], bodyKeys: '', promptChars: 0,
    };
}

// 流式过程中，每收到一段新内容就看一眼：构思什么时候结束、正文什么时候开始
function noteProgress(metrics, text, planExpected) {
    if (!metrics) return;
    const now = performance.now() - metrics.t0;
    const closeAt = text.indexOf('</构思>');
    if (metrics.tPlanEnd == null && closeAt >= 0) metrics.tPlanEnd = now;
    if (metrics.tFirstBody == null) {
        const probe = closeAt >= 0 ? text.slice(closeAt + 6) : (planExpected ? '' : text);
        if (/<(?:post|c|main)\b/i.test(probe)) metrics.tFirstBody = now;
    }
}

function fmtSec(ms) {
    return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}秒` : '—';
}

function hostOf(url) {
    try { return new URL(String(url)).host; } catch { return String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '(未填)'; }
}

// 酒馆自己的连接设置（只摘录和生成质量有关的、不含密钥和网址的几项）
function getStInfo() {
    try {
        const ctx = getContext();
        const info = { mainApi: ctx.mainApi };
        const cc = ctx.chatCompletionSettings;
        if (cc && typeof cc === 'object') {
            for (const k of ['chat_completion_source', 'temp_openai', 'top_p_openai', 'openai_max_tokens', 'stream_openai', 'reasoning_effort', 'show_thoughts', 'verbosity']) {
                if (k in cc) info[k] = cc[k];
            }
            const src = String(cc.chat_completion_source || '');
            const modelKey = [`${src}_model`, 'custom_model', 'openai_model'].find(k => typeof cc[k] === 'string' && cc[k]);
            if (modelKey) info.model = cc[modelKey];
        }
        return info;
    } catch {
        return { error: '读取酒馆设置失败' };
    }
}

function extractPlanText(raw) {
    const t = String(raw ?? '');
    const close = t.indexOf('</构思>');
    if (close < 0) {
        const open = t.indexOf('<构思>');
        return open >= 0 ? t.slice(open + 4) : '';
    }
    let body = t.slice(0, close);
    const open = body.indexOf('<构思>');
    if (open >= 0) body = body.slice(open + 4);
    return body.trim();
}

function sectionLines(planText, heading) {
    const i = planText.indexOf(heading);
    if (i < 0) return null;
    let rest = planText.slice(i + heading.length);
    const next = rest.search(/【/);
    if (next >= 0) rest = rest.slice(0, next);
    return rest.split(/\n/).map(l => l.trim()).filter(Boolean);
}

function avg(arr) {
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

// 汇总成一行，方便一眼对比不同的几次
function diagSummaryLine(info) {
    const raw = String(info.raw ?? '');
    const planLen = measurePlanLength(raw);
    const need = info.meta?.planMin;
    const body = stripPlanBlock(raw);
    const parsed = parseForumAny(body, true);
    const x = info.metrics;
    const parts = [
        `构思${planLen === null ? '无' : planLen + '字'}${need ? `(要求≥${need})` : ''}`,
        `输出共${raw.length}字`,
        parsed.mode === 'forum' ? `帖子${parsed.posts.length}个` : `主楼${parsed.roots.length}条`,
    ];
    if (x) {
        parts.push(`思考字段${x.reasoningChars}字`);
        parts.push(`首个正文字符${fmtSec(x.tFirstContent)}`);
        parts.push(`总耗时${fmtSec(x.tEnd)}`);
        parts.push(`结束原因${x.finishReason ?? '未知'}`);
    } else if (Number.isFinite(info.totalMs)) {
        parts.push(`总耗时${fmtSec(info.totalMs)}`);
    }
    return parts.join(' | ');
}

function buildDiagnosticReport(info) {
    const L = [];
    const push = (s = '') => L.push(s);
    const s = info.settings || {};
    const m = info.meta || {};
    const x = info.metrics;
    const raw = String(info.raw ?? '');
    const planText = extractPlanText(raw);
    const planLen = measurePlanLength(raw);
    const body = stripPlanBlock(raw);
    const parsed = parseForumAny(body, true);

    push('=== 观察者论坛 诊断报告 ===');
    push(`插件版本 ${PLUGIN_VERSION}    生成时间 ${new Date(info.startedAt).toLocaleString()}    状态：${info.status}`);
    if (info.error) push(`错误信息：${info.error}`);
    push(`【摘要】${diagSummaryLine(info)}`);
    push('');

    push('【连接】');
    if (info.useCustomApi) {
        push(`通道：自定义API（流式请求）    端点域名：${hostOf(s.customApi?.endpoint)}    模型：${s.customApi?.model || '(未填)'}`);
        push(`最大输出长度设置：${Number(s.maxOutputTokens) || 0}（0=不指定）`);
        push(`附加请求参数：${String(s.customApi?.extraBody || '').trim() || '(无)'}`);
        push(`请求体字段（不含内容）：${x?.bodyKeys || '?'}    提示词字数：${x?.promptChars ?? info.promptChars ?? '?'}`);
    } else {
        push('通道：酒馆主连接（走酒馆的预设和聊天历史，拿不到流式明细）');
        push(`酒馆连接信息：${JSON.stringify(info.stInfo || {})}`);
        push(`最大输出长度设置（responseLength）：${Number(s.maxOutputTokens) || 0}（0=不指定）    提示词字数：${info.promptChars ?? '?'}`);
    }
    push('');

    push('【设置】');
    push(`形式：${s.forumMode === 'forum' ? '多帖论坛' : '评论区'}    载体：${s.skin}    内容量：${s.richness}    先构思：${s.planFirst !== false ? '开' : '关'}    热评：${s.hotComments ? '开' : '关'}    主角参与：${s.protagonistMode ? '开' : '关'}`);
    push(`时间方向：${s.timeDirection}    身份：${s.identity}    世界书：${s.worldInfoEnabled !== false ? '开' : '关'}    只读AI发言：${s.aiOnly ? '开' : '关'}    读取楼数：${s.messageCount ?? s.count ?? '?'}    最多字符：${s.maxChars}`);
    push('');

    push('【提示词里这次随机抽到的内容】');
    push(`视角：${s.timeDirection}:${s.identity}    讨论话题：${m.topic || '(无)'}    当事人限定：${m.selves ? '是' : '否'}    同人加强：${s.fandomBoost ? `开（资料 ${m.fandomRefChars ?? 0} 字，${m.fandomRefSource || m.fandomRefNote || '无来源'}）` : '关'}`);
    push(`剧情原文字数：${m.storyChars ?? '?'}    构思最少字数要求：${m.planMin ?? '?'}    评论者人数要求：${m.personaMin ?? '?'}～${m.personaMax ?? '?'}`);
    if (m.angles) push(`讨论焦点：\n${m.angles.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}`);
    if (m.voices) push(`语言风格：${m.voices.join('；')}`);
    if (m.mode === 'forum') {
        push(`要求帖子数：${m.postCount}\n帖子分配表：\n${m.postTable}`);
    } else if (m.mode === 'thread') {
        push(`要求主楼数：${m.floorCount}    跟帖约：${m.replyCount}`);
        if (m.lengthTable) push(`字数分配表：\n${m.lengthTable}`);
    }
    push('');

    if (x) {
        push('【耗时与流式（自定义API）】');
        push(`请求发出→收到响应头：${fmtSec(x.tHeaders)}    →收到第一段数据：${fmtSec(x.tFirstChunk)}`);
        push(`→第一个正文字符：${fmtSec(x.tFirstContent)}    →第一个“思考”字符（reasoning 字段）：${fmtSec(x.tFirstReasoning)}`);
        push(`→构思结束（出现 </构思>）：${fmtSec(x.tPlanEnd)}    →第一条评论/帖子标签：${fmtSec(x.tFirstBody)}    总耗时：${fmtSec(x.tEnd)}`);
        push(`返回形式：${x.mode === 'sse' ? '流式（SSE）' : x.mode === 'json' ? '整段JSON（服务端没有流式）' : '未知'}    HTTP状态：${x.httpStatus ?? '?'}    数据块：${x.chunks}    字节：${x.bytes}`);
        push(`最长一次停顿：${fmtSec(x.maxGap)}（发生在请求后第 ${fmtSec(x.maxGapAt)}）    心跳/注释行：${x.keepAlive}    其他行：${x.otherLines}    无内容的数据块：${x.emptyDeltas}`);
        push(`流里收到的正文字数：${x.contentChars}    “思考”字段字数：${x.reasoningChars}    出现过的 delta 字段：${[...x.deltaKeys].join(',') || '(无)'}`);
        push(`结束原因 finish_reason：${x.finishReason ?? '(没收到)'}    返回的模型名：${x.model ?? '(无)'}    响应id：${x.id ?? '(无)'}`);
        push(`用量 usage：${x.usage ? JSON.stringify(x.usage) : '(服务端没返回；想要的话可在“附加请求参数”填 {"stream_options":{"include_usage":true}}，部分服务不支持)'}`);
        push(`响应头（摘录）：${Object.keys(x.headers).length ? JSON.stringify(x.headers) : '(无)'}`);
        push(`正文增长时间线（请求后秒数:累计字数）：${x.timeline.map(p => `${(p[0] / 1000).toFixed(0)}s:${p[1]}`).join('  ') || '(无)'}`);
    } else {
        push('【耗时】');
        push(`总耗时：${fmtSec(info.totalMs)}（走酒馆主连接，没有分阶段数据）`);
    }
    push('');

    push('【输出分析】');
    push(`输出总字数：${raw.length}    是否以 <构思> 开头：${raw.trimStart().startsWith('<构思>') ? '是' : '否'}    <构思> 出现 ${(raw.match(/<构思>/g) || []).length} 次，</构思> 出现 ${(raw.match(/<\/构思>/g) || []).length} 次`);
    push(`输出结尾是否是完整的结束标签：${/<\/(?:c|post|main)>\s*$/.test(raw.trim()) ? '是' : '否（可能被截断）'}`);
    if (s.planFirst !== false) {
        const need = m.planMin;
        push(`构思字数：${planLen === null ? '没有找到完整的构思' : planLen}（要求不少于 ${need ?? '?'}${planLen !== null && need ? `，达到 ${Math.round(planLen / need * 100)}%` : ''}）`);
        const headings = m.planHeadings?.length ? m.planHeadings : ['【可讨论的细节】', '【焦点核对】'];
        push(`构思小标题：${headings.map(h => `${h.replace(/[【】]/g, '')}${planText.includes(h) ? '✓' : '✗'}`).join('  ')}`);
        const outlineHeading = m.mode === 'forum' ? '【帖子策划】' : '【逐楼提纲】';
        const outline = sectionLines(planText, outlineHeading);
        const outlineNeed = m.mode === 'forum' ? m.postCount : (m.lengthTable ? m.floorCount : null);
        if (outlineNeed != null) push(`${outlineHeading.replace(/[【】]/g, '')}行数：${outline ? outline.length : '没有这一节'}（应有 ${outlineNeed}）`);
        const personas = sectionLines(planText, '【评论者名单】');
        if (personas) push(`评论者名单行数：${personas.length}（要求 ${m.personaMin}～${m.personaMax}）`);
        const roster = sectionLines(planText, '【出场角色名册】');
        if (roster) push(`出场角色名册行数：${roster.length}（当事人视角：发言者只能是剧情里出场的人）`);
    }

    // 去掉所有标签包着的内容后还剩多少游离文字
    const stray = body
        .replace(/<(c|title|body|main)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/?post\b[^>]*>/gi, '')
        .replace(/\s+/g, '').length;
    push(`标签之外的游离文字：${stray} 字    解析方式：${/<(?:post|c|main)\b/i.test(body) ? '标签格式' : '旧格式/无法识别'}`);
    const marks = (raw.match(/\[\s*done\s*\]|<\s*done\s*>|\[\s*end\s*\]|【\s*完\s*】/gi) || []);
    if (marks.length) push(`发现疑似结束标记：${marks.join(' ')}`);

    const lens = (arr) => arr.map(i => (i.content || '').length);
    if (parsed.mode === 'forum') {
        push(`实际帖子数：${parsed.posts.length}（要求 ${m.postCount ?? '?'}）    评论总数：${parsed.posts.reduce((a, p) => a + p.count, 0)}`);
        const rows = String(m.postTable || '').split('\n').map(l => l.match(/^第(\d+)帖｜(.+?)｜(热帖|普通帖|冷帖)｜楼主正文约(\d+)字｜回复约(\d+)条/)).filter(Boolean);
        const detail = parsed.posts.map((p, i) => {
            const plan = rows[i];
            const cl = lens(p.flat);
            return `  帖${i + 1}${plan ? `[${plan[3]}] 正文 计划${plan[4]}→实${p.body.length}；回复 计划${plan[5]}→实${p.count}` : ` 正文${p.body.length}；回复${p.count}`}；回复平均${avg(cl)}字，最长${cl.length ? Math.max(...cl) : 0}字`;
        });
        push(`逐帖（计划→实际）：\n${detail.join('\n')}`);
    } else {
        const roots = parsed.roots;
        const replies = parsed.flat.length - roots.length;
        push(`实际主楼：${roots.length} 条（要求 ${m.floorCount ?? '?'}）    跟帖：${replies} 条（要求约 ${m.replyCount ?? '?'}）`);
        const rows = String(m.lengthTable || '').split('\n').map(l => l.match(/^第(\d+)条主楼：(长评|中评|短评)，约(\d+)字/)).filter(Boolean);
        if (rows.length) {
            const cmp = roots.map((r, i) => (rows[i] ? `${i + 1}:${rows[i][2][0]}${rows[i][3]}→${r.content.length}` : `${i + 1}:?→${r.content.length}`));
            push(`逐条主楼（评论分配字数→实际字数）：${cmp.join('  ')}`);
            const ratioOf = (tier) => {
                const pairs = roots.map((r, i) => [rows[i], r]).filter(([row]) => row && row[2] === tier);
                if (!pairs.length) return '—';
                const sumT = pairs.reduce((a, [row]) => a + Number(row[3]), 0);
                const sumA = pairs.reduce((a, [, r]) => a + r.content.length, 0);
                return `${pairs.length}条，计划合计${sumT}→实际${sumA}（${Math.round(sumA / sumT * 100)}%）`;
            };
            push(`长评完成度：${ratioOf('长评')}\n中评完成度：${ratioOf('中评')}\n短评完成度：${ratioOf('短评')}`);
        }
        const all = lens(parsed.flat);
        push(`所有评论字数：平均 ${avg(all)}，最短 ${all.length ? Math.min(...all) : 0}，最长 ${all.length ? Math.max(...all) : 0}；总计 ${all.reduce((a, b) => a + b, 0)} 字`);
        const seen = new Map();
        for (const it of parsed.flat) seen.set(it.content, (seen.get(it.content) || 0) + 1);
        const dup = [...seen.values()].filter(n => n > 1).length;
        if (dup) push(`重复内容：有 ${dup} 条评论的内容出现了不止一次`);
    }
    push('');

    push('【原始输出全文】');
    push(raw || '(空)');
    push('【原始输出结束】');
    if (info.includePrompt && info.promptText) {
        push('');
        push('【提示词全文（含剧情原文）】');
        push(info.promptText);
        push('【提示词结束】');
    }
    return L.join('\n');
}

// ---------- 设置抽屉里的"诊断报告记录"界面 ----------
function refreshDiagUI() {
    const $sel = $('#future-observer-diag-select');
    if (!$sel.length) return;
    const prev = $sel.val();
    $sel.empty();
    diagReports.forEach((r, i) => {
        const when = new Date(r.time).toLocaleTimeString();
        $sel.append($('<option></option>').val(String(i)).text(`${when} · ${r.label || ''}`));
    });
    if (!diagReports.length) {
        $('#future-observer-diag-text').val('还没有诊断报告。生成一次评论区之后，这里会自动出现。');
        return;
    }
    const idx = prev !== undefined && prev !== null && String(prev) !== '' && diagReports[Number(prev)] ? String(prev) : String(diagReports.length - 1);
    $sel.val(idx);
    $('#future-observer-diag-text').val(diagReports[Number(idx)].text);
}

// opts.signal: 用于取消请求；opts.onChunk(textSoFar): 传了就走流式，边收边回调累计文字；
// opts.metrics: 传了就把各阶段耗时、数据块情况、结束原因等写进去（诊断报告用）
async function callCustomApi(prompt, apiConfig, maxTokens, opts = {}) {
    const mt = opts.metrics || null;
    const T = () => performance.now() - mt.t0;

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
    const bodyObj = {
        model: apiConfig.model || undefined,
        ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
        ...extra,
        messages,
        stream: wantStream,
    };
    if (mt) {
        mt.bodyKeys = Object.keys(bodyObj).filter(k => bodyObj[k] !== undefined).join(',');
        mt.promptChars = prompt.length;
    }
    const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: opts.signal,
        body: JSON.stringify(bodyObj),
    });
    if (mt) {
        mt.tHeaders = T();
        mt.httpStatus = response.status;
        try {
            response.headers.forEach((v, k) => {
                if (/^(content-type|server|via|x-request-id|request-id|cf-ray|openai-processing-ms|x-envoy-upstream-service-time|retry-after|x-ratelimit-.*|anthropic-ratelimit-.*)$/i.test(k)) {
                    mt.headers[k] = String(v).slice(0, 80);
                }
            });
        } catch { /* 读不到响应头就算了 */ }
    }

    if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 300); } catch { /* 忽略读取失败 */ }
        throw new Error(`自定义API请求失败（状态码 ${response.status}）${detail ? '：' + detail : ''}`);
    }

    // 不要求流式，或者环境不支持读取流：按普通 JSON 处理
    if (!wantStream || !response.body || typeof response.body.getReader !== 'function') {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (mt) {
            mt.mode = 'json';
            mt.tEnd = T();
            mt.usage = data?.usage ?? null;
            mt.model = data?.model ?? null;
            mt.id = data?.id ?? null;
            mt.finishReason = data?.choices?.[0]?.finish_reason ?? null;
            mt.contentChars = String(content || '').length;
        }
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
        if (mt && t.startsWith(':')) { mt.keepAlive++; return; }
        if (!t.startsWith('data:')) {
            if (mt && t) mt.otherLines++;
            return;
        }
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
            const j = JSON.parse(payload);
            const choice = j?.choices?.[0];
            const d = choice?.delta;
            if (mt) {
                if (j?.model) mt.model = j.model;
                if (j?.id) mt.id = j.id;
                if (j?.usage) mt.usage = j.usage;
                if (choice?.finish_reason) mt.finishReason = choice.finish_reason;
                if (d && typeof d === 'object') {
                    for (const k of Object.keys(d)) mt.deltaKeys.add(k);
                    const rc = d.reasoning_content ?? d.reasoning ?? d.thinking;
                    if (typeof rc === 'string' && rc) {
                        mt.reasoningChars += rc.length;
                        if (mt.tFirstReasoning == null) mt.tFirstReasoning = T();
                    }
                }
            }
            const delta = d?.content ?? choice?.message?.content;
            if (typeof delta === 'string' && delta) {
                acc += delta;
                if (mt) {
                    const now = T();
                    mt.contentChars = acc.length;
                    if (mt.tFirstContent == null) mt.tFirstContent = now;
                    const lastPoint = mt.timeline[mt.timeline.length - 1];
                    if (!lastPoint || now - lastPoint[0] >= 5000) mt.timeline.push([now, acc.length]);
                }
                opts.onChunk(acc);
            } else if (mt) {
                mt.emptyDeltas++;
            }
        } catch { /* 忽略不是JSON的行（比如心跳） */ }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (mt) {
            const now = T();
            mt.chunks++;
            mt.bytes += value?.length || 0;
            if (mt.lastChunkAt == null) {
                mt.tFirstChunk = now;
            } else if (now - mt.lastChunkAt > mt.maxGap) {
                mt.maxGap = now - mt.lastChunkAt;
                mt.maxGapAt = mt.lastChunkAt;
            }
            mt.lastChunkAt = now;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (mode === null) {
            const head = chunk.trimStart();
            if (!head) continue;
            mode = head.startsWith('{') ? 'json' : 'sse';
            if (mt) mt.mode = mode;
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

    if (mt) {
        mt.tEnd = T();
        if (acc) mt.timeline.push([mt.tEnd, acc.length]);
    }

    if (mode === 'json') {
        let data;
        try { data = JSON.parse(rawJson); } catch { throw new Error('自定义API返回的内容无法解析'); }
        const content = data?.choices?.[0]?.message?.content;
        if (mt) {
            mt.usage = data?.usage ?? null;
            mt.model = data?.model ?? null;
            mt.id = data?.id ?? null;
            mt.finishReason = data?.choices?.[0]?.finish_reason ?? null;
            const rc = data?.choices?.[0]?.message?.reasoning_content;
            if (typeof rc === 'string') mt.reasoningChars = rc.length;
            mt.contentChars = String(content || '').length;
            mt.tFirstContent = mt.tEnd;
        }
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

// ==================== 解析与渲染 ====================
// 提示词要求AI按固定格式输出：
//   主贴|网名|内容                          （旧版微博体留下的历史记录里可能有）
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

// 可选主题（名字对应样式表里的 .future-observer-th-名字）
const THEME_NAMES = ['aurora', 'terminal', 'blueprint', 'pop', 'steam', 'ink'];

// 取消生成时，把最后一个没写完的标签（以及它后面的内容）整段丢掉，只保留到最后一个结束标签为止
function trimToLastCloseTag(text) {
    const src = String(text ?? '');
    const re = /<\/(?:c|title|body|post|main)>/gi;
    let end = -1;
    let m;
    while ((m = re.exec(src))) end = m.index + m[0].length;
    return end < 0 ? '' : src.slice(0, end);
}

// ==================== 标签格式解析（新） ====================
// 提示词现在要求AI用成对的标签输出：
//   评论区模式：  <c n="1" by="网名" like="128">内容</c>        跟帖多一个 to="被回复的编号"
//   主贴：        <main by="网名">内容</main>（旧版微博体留下的历史记录里可能有，新版不再生成）
//   多帖论坛模式：<post id="1" board="版块" by="楼主" like="256"><title>…</title><body>…</body><c …>…</c></post>
// 比用竖线分隔的行更结实：内容里可以有竖线和换行；没写完的标签一眼就能识别并丢掉；跟帖明确知道回复的是哪一条。

const TAG_TOKEN_RE = /<(\/?)(post|title|body|main|c)\b([^>]*)>/gi;

function parseTagAttrs(str) {
    const attrs = {};
    const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)'|「([^」]*)」|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(str))) {
        attrs[m[1].toLowerCase()] = String(m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    }
    return attrs;
}

function cleanTagContent(s) {
    return String(s ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(?:post|title|body|main|c)\b[^>]*>/gi, '')
        .replace(/\r\n?/g, '\n')
        .replace(/^\s*\n+|\n+\s*$/g, '')
        .trim();
}

// 把一串评论记录 [{num, replyTo, name, likes, content}] 按先后顺序挂成"主楼 + 跟帖"的树
function buildThread(records) {
    const roots = [];
    const flat = [];
    const byNum = new Map();
    let lastRoot = null;
    for (const rec of records) {
        // 有的模型不会用 to 属性，而是把"to 1楼："这样的字样直接写进评论开头：认出来，转成真正的回复关系，并把这几个字从内容里去掉
        if (rec.replyTo == null) {
            const pm = String(rec.content).match(/^\s*(?:to|TO|To|回复|回覆|@|＠)\s*[#＃]?(\d{1,3})\s*(?:楼|层)?\s*(?:[:：,，、]|\s)\s*(?=\S)/);
            if (pm && byNum.has(Number(pm[1]))) {
                rec.replyTo = Number(pm[1]);
                rec.content = String(rec.content).slice(pm[0].length);
            }
        }
        const item = {
            kind: rec.replyTo != null ? 'reply' : 'floor',
            num: rec.num,
            replyTo: rec.replyTo,
            name: rec.name,
            likes: rec.likes,
            content: rec.content,
            children: [],
            target: null,
            replyToName: '',
        };
        if (item.kind === 'reply') {
            const target = byNum.get(item.replyTo);
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
            roots.push(item);
            lastRoot = item;
        }
        if (Number.isFinite(item.num) && !byNum.has(item.num)) byNum.set(item.num, item);
        flat.push(item);
    }
    return { roots, flat, count: flat.length };
}

function commentRecord(attrs, content, seq) {
    const nRaw = attrs.n ?? attrs.floor ?? attrs.id;
    const toRaw = attrs.to ?? attrs.reply ?? attrs.re;
    const likeRaw = attrs.like ?? attrs.likes;
    return {
        num: nRaw !== undefined && /^\d+$/.test(String(nRaw).trim()) ? Number(nRaw) : seq,
        replyTo: toRaw !== undefined && /^\d+$/.test(String(toRaw).trim()) ? Number(toRaw) : null,
        name: attrs.by || attrs.name || attrs.author || attrs.user || '匿名',
        likes: likeRaw !== undefined ? parseLikes(likeRaw) : null,
        content,
    };
}

// 扫描全文里的标签，逐个取出内容。final=false（流式输出中）时，没写完的最后一个元素会被丢掉。
function parseTagged(text, final) {
    const tokens = [];
    const re = new RegExp(TAG_TOKEN_RE.source, 'gi');
    let m;
    while ((m = re.exec(text))) {
        tokens.push({ close: m[1] === '/', tag: m[2].toLowerCase(), attrs: m[3], start: m.index, end: m.index + m[0].length });
    }

    const out = { main: null, posts: [], loose: [], looseSeq: 0 };
    let curPost = null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.close) continue;
        const next = tokens[i + 1];
        const complete = !!next; // 后面还有标签，说明这一段已经写完
        const content = cleanTagContent(text.slice(t.end, next ? next.start : text.length));
        const attrs = parseTagAttrs(t.attrs);
        const usable = complete || final;

        if (t.tag === 'post') {
            curPost = {
                board: attrs.board || attrs.section || attrs.tag || '',
                name: attrs.by || attrs.name || attrs.author || attrs.user || '匿名',
                likes: (attrs.like ?? attrs.likes) !== undefined ? parseLikes(attrs.like ?? attrs.likes) : null,
                title: '', body: '', comments: [], seq: 0,
            };
            out.posts.push(curPost);
        } else if (t.tag === 'title') {
            if (curPost && usable && content) curPost.title = content.replace(/\s*\n\s*/g, ' ');
        } else if (t.tag === 'body') {
            if (curPost && usable && content) curPost.body = content;
        } else if (t.tag === 'main') {
            if (!out.main && usable && content) out.main = { name: attrs.by || attrs.name || attrs.author || '', content };
        } else if (t.tag === 'c') {
            if (!usable || !content) continue;
            if (curPost) curPost.comments.push(commentRecord(attrs, content, ++curPost.seq));
            else out.loose.push(commentRecord(attrs, content, ++out.looseSeq));
        }
    }
    return out;
}

function parseTaggedResult(text, final) {
    const t = parseTagged(text, final);
    if (t.posts.length) {
        const posts = t.posts
            .map(p => ({ board: p.board, name: p.name, likes: p.likes, title: p.title, body: p.body, ...buildThread(p.comments) }))
            .filter(p => p.title || p.body || p.count);
        if (posts.length) {
            return {
                mode: 'forum', posts, mainPost: null, roots: [], flat: [],
                count: posts.reduce((a, p) => a + p.count + 1, 0), mergedLines: 0,
            };
        }
    }
    if (t.loose.length || t.main) {
        const th = buildThread(t.loose);
        return { mode: 'thread', mainPost: t.main, ...th, mergedLines: 0 };
    }
    return null;
}

// 统一入口：有标签就按标签格式解析；没有就退回旧的竖线/旧格式解析（兼容历史记录和不听话的模型）
function parseForumAny(text, final = true) {
    const src = String(text ?? '');
    if (/<(?:post|c|main)\b/i.test(src)) {
        const tagged = parseTaggedResult(src, final);
        if (tagged) return tagged;
    }
    const legacy = parseForumSmart(src);
    return { mode: 'thread', ...legacy };
}

// 网名是否就是主角（网名后面如果带括号标注，括号前面的部分才算）
function isProtagonistName(name, protagonist) {
    if (!protagonist) return false;
    const base = String(name ?? '').replace(/[（(].*$/, '').trim();
    return base === protagonist;
}

function filterThreadProtagonist(thread, protagonist) {
    const keptRoots = [];
    const keep = new Set();
    for (const root of thread.roots) {
        if (isProtagonistName(root.name, protagonist)) continue;
        root.children = root.children.filter(c => !isProtagonistName(c.name, protagonist));
        keptRoots.push(root);
        keep.add(root);
        root.children.forEach(c => keep.add(c));
    }
    const flat = thread.flat.filter(x => keep.has(x)); // 保持原来的出现顺序
    return { roots: keptRoots, flat, count: flat.length };
}

// 没开"主角参与"时的保险：就算AI不听话把主角写进来了，也在显示时直接去掉
function dropProtagonist(parsed, protagonist) {
    if (!protagonist) return parsed;
    if (parsed.mode === 'forum') {
        const posts = parsed.posts
            .filter(p => !isProtagonistName(p.name, protagonist))
            .map(p => ({ ...p, ...filterThreadProtagonist(p, protagonist) }));
        return { ...parsed, posts, count: posts.reduce((a, p) => a + p.count + 1, 0) };
    }
    const th = filterThreadProtagonist(parsed, protagonist);
    const mainPost = parsed.mainPost && isProtagonistName(parsed.mainPost.name, protagonist) ? null : parsed.mainPost;
    return { ...parsed, mainPost, ...th };
}

function snippet(text, max) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
}

// 生成结果的统一清洗入口：去掉"构思"草稿，只留正文（存历史记录用）
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

// 热帖：赞数 + 回复数×8
function postHotScore(p) {
    return (Number.isFinite(p.likes) ? p.likes : 0) + p.count * 8;
}

// 渲染用的一组小工具
function makeRenderHelpers(settings, protagonist, protagonistOn) {
    const H = {};
    H.likesHtml = (item) => (Number.isFinite(item.likes)
        ? `<span class="future-observer-likes">👍 ${escapeHtml(formatLikes(item.likes))}</span>` : '');
    H.isMe = (item) => protagonistOn && isProtagonistName(item.name, protagonist);
    H.meBadge = (item) => (H.isMe(item) ? '<span class="future-observer-chip future-observer-chip-small">主角</span>' : '');
    H.meClass = (item) => (H.isMe(item) ? ' is-protagonist' : '');

    // 树形：主楼 + 挂在下面的跟帖（论坛楼层 / 新闻评论区 / 帖子详情页共用）
    H.treeHtml = (thread, hotEnabled) => {
        const renderRoot = (root, hot) => {
            let h = `<div class="future-observer-floor${hot ? ' is-hot' : ''}${H.meClass(root)}">`
                + '<div class="future-observer-floor-head">'
                + (hot ? '<span class="future-observer-hot-badge">🔥</span>' : '')
                + `<span class="future-observer-name">${escapeHtml(root.name)}</span>${H.meBadge(root)}`
                + `${H.likesHtml(root)}<span class="future-observer-num">${escapeHtml(floorLabel(root))}</span></div>`
                + `<div class="future-observer-text">${escapeHtml(root.content)}</div>`;
            if (root.children.length) {
                h += '<div class="future-observer-replies">';
                for (const child of root.children) {
                    h += `<div class="future-observer-reply${H.meClass(child)}">`
                        + `<div class="future-observer-reply-head"><span class="future-observer-name">${escapeHtml(child.name)}</span>${H.meBadge(child)}`
                        + (child.replyToName ? `<span class="future-observer-reply-to">回复 ${escapeHtml(child.replyToName)}</span>` : '')
                        + `${H.likesHtml(child)}<span class="future-observer-num">${escapeHtml(floorLabel(child))}</span></div>`
                        + `<div class="future-observer-text">${escapeHtml(child.content)}</div></div>`;
                }
                h += '</div>';
            }
            return h + '</div>';
        };

        const hotRoots = hotEnabled ? pickHotRoots(thread.roots) : [];
        let html = '';
        if (hotRoots.length) {
            const hotSet = new Set(hotRoots);
            html += '<div class="future-observer-group-title">🔥 热评</div>';
            for (const root of hotRoots) html += renderRoot(root, true);
            html += '<div class="future-observer-group-title">全部评论</div>';
            for (const root of thread.roots) if (!hotSet.has(root)) html += renderRoot(root, false);
        } else {
            for (const root of thread.roots) html += renderRoot(root, false);
        }
        return html;
    };

    H.chatHtml = (thread) => {
        let html = '';
        for (const item of thread.flat) {
            html += `<div class="future-observer-msg${H.meClass(item)}">`
                + `<div class="future-observer-msg-name">${escapeHtml(item.name)}${H.meBadge(item)}</div>`
                + '<div class="future-observer-bubble">'
                + (item.kind === 'reply' && item.target
                    ? `<div class="future-observer-quote">↩ ${escapeHtml(item.target.name)}：${escapeHtml(snippet(item.target.content, 24))}</div>` : '')
                + `<div class="future-observer-text">${escapeHtml(item.content)}</div></div></div>`;
        }
        return html;
    };

    H.danmakuHtml = (thread) => {
        let html = '';
        for (const item of thread.flat) {
            html += `<div class="future-observer-danmaku-item${H.meClass(item)}">`
                + `<span class="future-observer-danmaku-text">${escapeHtml(item.content)}</span>`
                + `<span class="future-observer-danmaku-name">${escapeHtml(item.name)}</span></div>`;
        }
        return html;
    };
    return H;
}

// 多帖论坛：帖子列表 / 帖子详情
function renderForumHtml(parsed, H, postIdx, settings, streaming) {
    const posts = parsed.posts;

    if (Number.isInteger(postIdx) && posts[postIdx]) {
        const p = posts[postIdx];
        let h = '<div class="future-observer-feed future-observer-postdetail">'
            + '<div class="future-observer-postbar"><button type="button" class="future-observer-postback">‹ 返回列表</button>'
            + `<span class="future-observer-postbar-title">${escapeHtml(snippet(p.title || p.body, 30))}</span></div>`
            + '<div class="future-observer-posthead">'
            + '<div class="future-observer-posthead-top">'
            + (p.board ? `<span class="future-observer-chip future-observer-chip-small">${escapeHtml(p.board)}</span>` : '')
            + `<span class="future-observer-name">${escapeHtml(p.name)}</span>${H.meBadge(p)}${H.likesHtml(p)}</div>`
            + `<div class="future-observer-posttitle">${escapeHtml(p.title || snippet(p.body, 24))}</div>`
            + (p.body ? `<div class="future-observer-text">${escapeHtml(p.body)}</div>` : '')
            + '</div>';
        h += p.count
            ? H.treeHtml(p, !!settings.hotComments && !streaming)
            : '<div class="future-observer-empty">这个帖子还没有人回复。</div>';
        h += '<button type="button" class="future-observer-postback future-observer-postback-bottom">‹ 返回帖子列表</button>';
        if (streaming) h += '<div class="future-observer-streaming">✍️ 正在写……</div>';
        return h + '</div>';
    }

    const order = posts.map((_, i) => i);
    let hotSet = new Set();
    if (settings.hotComments && !streaming && posts.length >= 3) {
        const ranked = order.slice().sort((a, b) => postHotScore(posts[b]) - postHotScore(posts[a]));
        hotSet = new Set(ranked.slice(0, 2));
    }
    const card = (i) => {
        const p = posts[i];
        const hot = hotSet.has(i);
        return `<div class="future-observer-postcard${hot ? ' is-hot' : ''}${H.meClass(p)}" data-fo-post="${i}">`
            + '<div class="future-observer-postcard-top">'
            + (hot ? '<span class="future-observer-hot-badge">🔥</span>' : '')
            + (p.board ? `<span class="future-observer-chip future-observer-chip-small">${escapeHtml(p.board)}</span>` : '')
            + '</div>'
            + `<div class="future-observer-postcard-title">${escapeHtml(p.title || snippet(p.body, 24) || '（无标题）')}</div>`
            + (p.body ? `<div class="future-observer-postcard-snippet">${escapeHtml(snippet(p.body, 70))}</div>` : '')
            + '<div class="future-observer-postcard-meta">'
            + `<span class="future-observer-name">${escapeHtml(p.name)}</span>${H.meBadge(p)}`
            + `${H.likesHtml(p)}<span class="future-observer-comments-count">💬 ${p.count}</span></div></div>`;
    };

    let h = '<div class="future-observer-feed future-observer-postlist">';
    if (hotSet.size) {
        h += '<div class="future-observer-group-title">🔥 热帖</div>';
        for (const i of order.filter(i => hotSet.has(i)).sort((a, b) => postHotScore(posts[b]) - postHotScore(posts[a]))) h += card(i);
        h += '<div class="future-observer-group-title">全部帖子</div>';
        for (const i of order.filter(i => !hotSet.has(i))) h += card(i);
    } else {
        for (const i of order) h += card(i);
    }
    if (streaming) h += '<div class="future-observer-streaming">✍️ 正在写……</div>';
    return h + '</div>';
}

// 把生成结果渲染出来。
// opts.streaming: 流式输出中，内容还没写完——不做热评重排，末尾加"正在写"提示
function renderResultInto($el, rawText, opts = {}) {
    const settings = getSettings();
    const streaming = !!opts.streaming;
    const raw = String(rawText ?? '');
    // 记下来，点开帖子/返回列表时要用同一份内容重新渲染
    $el.data('foRaw', raw);

    // 开了"先构思"，且还没看到构思结束标签、也还没开始出现正文：说明还在构思阶段
    const planMode = settings.planFirst !== false;
    const hasBodyStart = /<(?:post|c|main)\b/i.test(raw) || /^[\s*]*(?:主贴|主?楼层?|回复?)\s*[|｜]/m.test(raw);
    if (streaming && !/<\/构思>/.test(raw) && ((/<构思>/.test(raw)) || (planMode && !hasBodyStart))) {
        $el.text(`🧠 正在构思……（已写 ${raw.length} 字）`);
        return;
    }

    let text = stripPlanBlock(raw);
    const hasTags = /<(?:post|c|main)\b/i.test(text);
    if (streaming && !hasTags) text = trimIncompleteTail(text);
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
    let parsed = parseForumAny(text, !streaming);
    if (!protagonistOn) parsed = dropProtagonist(parsed, protagonist);

    // 流式输出中，还没有任何一条写完整：别把半截标签当正文显示
    if (streaming && parsed.mode === 'thread' && parsed.count === 0 && !parsed.mainPost) {
        $el.text('✍️ 正在写……');
        return;
    }

    // 当事人视角：隐藏不在"出场角色名册"里的发言者（名册解析不出来、或会误删太多时不过滤）
    let castDropped = 0;
    if (!streaming) {
        const roster = getRosterFromText(raw);
        if (roster.length) {
            const res = applyCastFilter(parsed, roster);
            parsed = res.parsed;
            castDropped = res.dropped;
        }
    }

    const H = makeRenderHelpers(settings, protagonist, protagonistOn);
    let html;

    if (parsed.mode === 'forum') {
        const postIdx = $el.data('foPost');
        html = renderForumHtml(parsed, H, Number.isInteger(postIdx) ? postIdx : null, settings, streaming);
    } else if (parsed.count === 0 && !parsed.mainPost && !streaming && planMode && !/<\/构思>/.test(raw)) {
        // 开了先构思，却没有任何楼层、也没有构思结束标签：多半是输出在构思阶段被截断了
        $el.text('没有识别到论坛格式的内容。可能是输出在“构思”阶段就被截断了（请调大“最大输出长度”），也可能是AI没按格式输出（在设置里打开“开发者模式”可以看到它写了什么）。');
        return;
    } else if (parsed.count === 0 && !parsed.mainPost) {
        // 完全认不出格式：退回逐行显示（过滤掉空行和纯符号行）
        html = `<div class="future-observer-feed future-observer-skin-${skin}">`;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => /[\p{L}\p{N}]/u.test(l));
        for (const line of lines) {
            html += `<div class="future-observer-floor"><div class="future-observer-text">${escapeHtml(line)}</div></div>`;
        }
        html += '</div>';
    } else {
        html = `<div class="future-observer-feed future-observer-skin-${skin}">`;
        if (parsed.mainPost) {
            const mp = parsed.mainPost;
            html += '<div class="future-observer-mainpost"><div class="future-observer-mainpost-head">'
                + '<span class="future-observer-chip">主贴</span>'
                + (mp.name ? `<span class="future-observer-name">${escapeHtml(mp.name)}</span>` : '')
                + `</div><div class="future-observer-text">${escapeHtml(mp.content)}</div></div>`;
        }
        if (skin === 'chat') html += H.chatHtml(parsed);
        else if (skin === 'danmaku') html += H.danmakuHtml(parsed);
        else html += H.treeHtml(parsed, !streaming && !!settings.hotComments && SKIN_SPECS[skin].hotAllowed);
        if (streaming) html += '<div class="future-observer-streaming">✍️ 正在写……</div>';
        html += '</div>';
    }

    if (castDropped > 0) {
        html += `<div class="future-observer-filternote">已隐藏 ${castDropped} 条不在“出场角色名册”里的发言</div>`;
    }
    $el.html(html);
}

// 点开帖子/返回列表时，用同一份内容重新渲染（多帖论坛模式）
function rerenderResultBox($box) {
    const raw = $box.data('foRaw');
    if (raw === undefined) return;
    renderResultInto($box, raw);
    appendResultExtras($box);
    const el = $box.get(0);
    if (el && $box.hasClass('future-observer-popup-result')) el.scrollTop = 0;
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
    $('.future-observer-result').each(function () {
        const $box = $(this);
        $box.removeData('foPost').removeData('foRawFull').removeData('foInfo').removeData('foDiag');
        renderResultInto($box, entry.text);
    });
    refreshHistoryNav();
}

// 在结果区底部加一个"查看AI原始输出"：格式出问题时，可以看到AI到底写了什么，复制出来排查
// 量一下AI这次写的构思有多少字（没写完/没写返回 null）
function measurePlanLength(raw) {
    const t = String(raw ?? '');
    const close = t.indexOf('</构思>');
    if (close < 0) return null;
    let body = t.slice(0, close);
    const open = body.indexOf('<构思>');
    if (open >= 0) body = body.slice(open + '<构思>'.length);
    return body.trim().length;
}

function appendRawViewer($el, raw, diagText) {
    const text = String(raw ?? '').trim();
    if (!text && !diagText) return;
    const $wrap = $('<div class="future-observer-rawwrap"></div>');
    if (text) {
        let label = '📄 查看AI原始输出（格式出问题时可复制出来排查）';
        const settings = getSettings();
        if (settings.planFirst !== false) {
            const planLen = measurePlanLength(text);
            const need = PLAN_MIN_CHARS[settings.richness] || PLAN_MIN_CHARS.rich;
            if (planLen === null) label = '📄 查看AI原始输出（没有找到完整的构思）';
            else label = `📄 查看AI原始输出（构思 ${planLen} 字${planLen < need * 0.6 ? `，要求不少于 ${need}，偏短` : ''}）`;
        }
        $wrap.append($('<span class="future-observer-rawtoggle"></span>').text(label));
        $wrap.append($('<textarea class="future-observer-rawtext" readonly style="display:none;"></textarea>').val(text));
    }
    if (diagText) {
        const $row = $('<div class="future-observer-diagrow"></div>');
        $row.append($('<span class="future-observer-diagtoggle"></span>').text('🩺 诊断报告（遇到问题时，整份复制发给开发者）'));
        const $box = $('<div class="future-observer-diagbox" style="display:none;"></div>');
        $box.append($('<textarea class="future-observer-diagtext" readonly></textarea>').val(diagText));
        $box.append($('<button type="button" class="future-observer-diagcopy"></button>').text('📋 复制整份报告'));
        $row.append($box);
        $wrap.append($row);
    }
    $el.append($wrap);
}

// ==================== 结果信息栏（取代原来的"原始输出""诊断报告"） ====================
// 每次生成完，结果区底部只留一行基础情报：模型、token、耗时、速度、构思字数、结束原因。
// 疑似被分到"快速通道"（速度异常快、构思明显偏短）时，会多一条提示和"重新生成"按钮。
// 完整的诊断报告和AI原始输出，需要在设置里打开"开发者模式"才会显示。

function detectFastChannel(info) {
    const reasons = [];
    if (info.status !== '完成') return reasons;
    const s = info.settings || {};
    const x = info.metrics;
    const sec = (info.totalMs ?? x?.tEnd ?? 0) / 1000;
    const out = x?.usage?.completion_tokens;
    const th = Number(s.fastTokPerSec);
    if (th > 0 && out && sec > 5 && out / sec > th) {
        reasons.push(`输出速度约 ${Math.round(out / sec)} token/秒，高于你设的 ${th}`);
    }
    if (s.planFirst !== false && info.meta?.planMin) {
        const pl = measurePlanLength(info.raw);
        if (pl === null) reasons.push('没有找到完整的构思');
        else if (pl < info.meta.planMin * 0.85) reasons.push(`构思只有 ${pl} 字，不到要求的 ${info.meta.planMin} 字的 85%`);
    }
    return reasons;
}

function buildInfoSummary(info) {
    const s = info.settings || {};
    const x = info.metrics;
    const m = info.meta || {};
    const model = x?.model || (info.useCustomApi ? s.customApi?.model : info.stInfo?.model) || '未知模型';
    const usage = x?.usage;
    const sec = (info.totalMs ?? x?.tEnd ?? 0) / 1000;
    const raw = String(info.raw ?? '');
    const parts = [];
    if (info.status !== '完成') parts.push(`状态：${info.status}`);
    if (info.error) parts.push(String(info.error).slice(0, 80));
    parts.push(`模型 ${model}`);
    if (usage?.prompt_tokens && usage?.completion_tokens) {
        parts.push(`输入 ${usage.prompt_tokens} / 输出 ${usage.completion_tokens} token`);
    } else {
        parts.push(`输入约 ${info.promptChars ?? '?'} 字 / 输出约 ${raw.length} 字`);
    }
    if (sec > 0) parts.push(`耗时 ${sec.toFixed(1)} 秒`);
    if (sec > 1) {
        if (usage?.completion_tokens) parts.push(`${Math.round(usage.completion_tokens / sec)} token/秒`);
        else if (raw.length) parts.push(`${Math.round(raw.length / sec)} 字/秒`);
    }
    if (s.planFirst !== false) {
        const pl = measurePlanLength(raw);
        if (pl !== null) parts.push(`构思 ${pl} 字`);
    }
    if (x?.finishReason) parts.push(`结束：${x.finishReason}`);
    if (m.fandomRefChars) parts.push(`📚 资料 ${m.fandomRefChars} 字`);
    else if (s.fandomBoost && m.fandom) parts.push(`📚 ${m.fandomRefNote || '没有资料'}`);

    const buffered = !!(x && x.chunks > 0 && x.tEnd != null && x.tFirstChunk != null && (x.tEnd - x.tFirstChunk) < 800 && x.contentChars > 800);
    const reasons = detectFastChannel(info);
    const text = parts.join(' · ');
    const title = buffered
        ? '中转站把整段内容写完才一起发过来，所以只能看到总耗时，分不出思考和输出各花了多久。'
        : (x?.tPlanEnd ? `构思阶段花了 ${(x.tPlanEnd / 1000).toFixed(1)} 秒。` : '');
    return { text, title, reasons, copyText: text + (reasons.length ? `\n疑似快速通道：${reasons.join('；')}` : '') };
}

function appendInfoBar($el, infoObj) {
    if (!infoObj) return;
    const $bar = $('<div class="future-observer-infobar"></div>');
    $bar.data('copy', infoObj.copyText);
    $bar.append($('<div class="future-observer-infoline"></div>').text(infoObj.text).attr('title', infoObj.title || ''));
    if (infoObj.reasons && infoObj.reasons.length) {
        const $w = $('<div class="future-observer-fastwarn"></div>');
        $w.append($('<span></span>').text(`⚡ 这次疑似被分到“快速通道”，内容可能偏薄：${infoObj.reasons.join('；')}`));
        $w.append($('<button type="button" class="future-observer-regen"></button>').text('🔁 重新生成'));
        $bar.append($w);
    }
    $bar.append($('<div class="future-observer-infoactions"></div>').append($('<span class="future-observer-infocopy"></span>').text('📋 复制这行')));
    $el.append($bar);
}

// 结果区底部的附加内容：信息栏；开发者模式下再加原始输出和完整诊断报告
function appendResultExtras($box) {
    appendInfoBar($box, $box.data('foInfo'));
    if (getSettings().devMode) {
        const full = $box.data('foRawFull');
        const diag = $box.data('foDiag');
        if (full || diag) appendRawViewer($box, full, diag);
    }
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
            renderResultInto($(box), run.partial, { streaming: true });
            if (nearBottom && $(box).hasClass('future-observer-popup-result')) {
                box.scrollTop = box.scrollHeight;
            }
        });
    }, 150);
}

// 走酒馆主连接的"原始生成"：只发我们自己的提示词，不带预设和聊天历史
async function callMainRaw(ctx, prompt, maxTokens) {
    const gr = ctx.generateRaw;
    // 新版酒馆用对象传参（函数的 length 为 0），旧版按顺序传参
    if (gr.length === 0) {
        return await gr({ prompt, responseLength: maxTokens > 0 ? maxTokens : undefined, trimNames: false });
    }
    return await gr(prompt, null, false, false, '', maxTokens > 0 ? maxTokens : undefined);
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
    rememberTopic(settings.topic);
    const run = {
        cancelled: false,
        abort: new AbortController(),
        useCustomApi: !!settings.customApi?.enabled,
        partial: '',
        renderTimer: null,
        resolveCancel: null,
        t0: performance.now(),
        metrics: null,
    };
    currentRun = run;
    const startedAt = Date.now();

    // 信息栏和诊断报告要用到的材料：边生成边收集
    let promptText = '';
    let promptMeta = null;
    const settingsSnapshot = JSON.parse(JSON.stringify({
        ...settings,
        customApi: { ...(settings.customApi || {}), apiKey: undefined, modelList: undefined },
        fandomWorkHistory: undefined,
        fandomLibrary: undefined,
        topicHistory: undefined,
    }));
    // 生成一份信息栏内容；开发者模式下再生成完整诊断报告
    const finalize = (status, rawText, errorMsg) => {
        const x = run.metrics;
        if (x && x.tEnd == null) x.tEnd = performance.now() - x.t0;
        const info = {
            status, error: errorMsg || '', raw: rawText || '', startedAt,
            settings: settingsSnapshot, meta: promptMeta, metrics: x,
            useCustomApi: run.useCustomApi, promptChars: promptText.length,
            totalMs: performance.now() - run.t0,
            stInfo: run.useCustomApi ? null : getStInfo(),
            includePrompt: !!settings.diagFullPrompt,
            promptText,
        };
        let infoObj = null;
        let report = '';
        try { infoObj = buildInfoSummary(info); } catch (e) { console.warn('[观察者论坛] 生成信息栏失败：', e); }
        if (settings.devMode) {
            try {
                report = buildDiagnosticReport(info);
                addDiagReport(report, `${status} · ${diagSummaryLine(info)}`);
            } catch (e) {
                console.warn('[观察者论坛] 生成诊断报告失败：', e);
            }
        }
        return { infoObj, report };
    };
    const showExtras = (rawText, infoObj, report) => {
        resultBoxes.each(function () {
            const $box = $(this);
            $box.data('foInfo', infoObj).data('foRawFull', rawText).data('foDiag', report);
            appendResultExtras($box);
        });
    };

    setOptionsOpen(false); // 一点生成就把选项折叠起来，把空间让给评论区
    setRunningUI(true);
    resultBoxes.text('🔭 正在观察……');

    try {
        const maxTokens = Number(settings.maxOutputTokens) || 0;
        const planExpected = settings.planFirst !== false;
        let result = '';
        let failed = false;
        let failMsg = '';

        try {
            const prompt = await buildPrompt(story);
            promptText = prompt;
            promptMeta = lastPromptMeta ? { ...lastPromptMeta } : null;
            if (run.cancelled) throw new Error('cancelled');

            if (run.useCustomApi) {
                run.metrics = newMetrics();
                result = await callCustomApi(prompt, settings.customApi, maxTokens, {
                    signal: run.abort.signal,
                    metrics: run.metrics,
                    onChunk: (text) => {
                        run.partial = text;
                        noteProgress(run.metrics, text, planExpected);
                        scheduleStreamRender(run);
                    },
                });
            } else {
                const ctx = getContext();
                const cancelled = new Promise((resolve) => { run.resolveCancel = () => resolve(CANCELLED); });
                let main;
                if (settings.mainRaw && typeof ctx.generateRaw === 'function') {
                    main = callMainRaw(ctx, prompt, maxTokens);
                } else {
                    if (settings.mainRaw) toastr.warning('当前酒馆版本没有“原始生成”接口，已改用普通方式。', '观察者论坛');
                    let generateQuietPrompt = ctx.generateQuietPrompt;
                    if (typeof generateQuietPrompt !== 'function') {
                        ({ generateQuietPrompt } = await import('../../../../script.js'));
                    }
                    main = generateQuietPrompt({
                        quietPrompt: prompt,
                        quietToLoud: false,
                        ...(maxTokens > 0 ? { responseLength: maxTokens } : {}),
                    });
                }
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
                failMsg = msg;
                resultBoxes.text(`生成失败：${msg}`);
                toastr.error('观测生成失败，请打开控制台查看错误。');
            }
        }

        if (failed) {
            const { infoObj, report } = finalize('失败', run.partial, failMsg);
            showExtras(run.partial, infoObj, report);
            return;
        }

        // 流式阶段到此结束：停掉还没触发的刷新，免得它盖掉下面的最终渲染
        run.finished = true;
        if (run.renderTimer) { clearTimeout(run.renderTimer); run.renderTimer = null; }

        const rawOriginal = result || run.partial || ''; // 原始输出（含构思）

        if (run.cancelled) {
            // 取消：能保留多少保留多少（最后一行可能只写了一半，丢掉）
            const partialRaw = result || run.partial || '';
            // 标签格式下，没写完的元素解析时会自动丢掉，不用再按行截断；旧格式才需要丢掉半截的最后一行
            const partial = cleanForumResult(/<(?:post|c|main)\b/i.test(partialRaw) ? trimToLastCloseTag(partialRaw) : trimIncompleteTail(partialRaw));
            const parsedPartial = parseForumAny(partial, false);
            if (!parsedPartial.count && !parsedPartial.mainPost) {
                resultBoxes.text('已取消。');
                const { infoObj, report } = finalize('已取消（没有可保留的内容）', rawOriginal);
                showExtras(rawOriginal, infoObj, report);
                return;
            }
            result = partial;
            toastr.info('已停止，保留了已经写好的部分。', '观察者论坛');
        }

        const { infoObj, report } = finalize(run.cancelled ? '已停止（保留了写好的部分）' : '完成', rawOriginal);
        const cleaned = cleanForumResult(result); // 去掉"构思"草稿，只留正文
        resultBoxes.each(function () {
            const $box = $(this);
            $box.removeData('foPost'); // 新一轮结果：回到帖子列表
            renderResultInto($box, result);
        });
        showExtras(rawOriginal, infoObj, report);
        $('.future-observer-popup-result').scrollTop(0);

        if (!cleaned) {
            // 只有构思、没有正文（多半是输出长度不够被截断了），不存进历史记录，免得污染
            return;
        }

        // 当事人视角：把"出场角色名册"带进历史记录，翻看旧记录时也能过滤名册外的发言
        let toStore = cleaned;
        if (!/<roster>/.test(cleaned) && settings.identity === 'selves' && settings.timeDirection !== 'otherworld') {
            const roster = extractRosterFromPlan(extractPlanText(rawOriginal));
            if (roster.length) toStore = `<roster>${roster.join('、')}</roster>\n${cleaned}`;
        }
        const scopeKey = getMemoryScopeKey(settings);
        await pushHistoryEntry(scopeKey, toStore); // 每次生成都会存进历史记录
        historyCursor[scopeKey] = getHistoryList(scopeKey).length - 1; // 新生成的这条，游标指向最新
        refreshHistoryNav();
    } finally {
        if (run.renderTimer) clearTimeout(run.renderTimer);
        currentRun = null;
        setRunningUI(false);
    }
}

// 把"视角"下拉框填好（分组：当事人 / 旁观者 / 异世界），并选中当前的视角
function renderPerspectiveOptions($select, direction, identity) {
    $select.empty();
    for (const g of PERSPECTIVE_GROUPS) {
        const $g = $('<optgroup>').attr('label', g.label);
        for (const it of g.items) $g.append($('<option>', { value: it.value, text: it.label }));
        $select.append($g);
    }
    const cur = `${direction}:${identity}`;
    const valid = PERSPECTIVE_GROUPS.some(g => g.items.some(it => it.value === cur));
    $select.val(valid ? cur : 'future:onlookers');
}

const TOPIC_HISTORY_MAX = 8;

function rememberTopic(topic) {
    const t = String(topic || '').trim();
    if (!t) return;
    const settings = getSettings();
    const history = Array.isArray(settings.topicHistory) ? settings.topicHistory : [];
    settings.topicHistory = [t, ...history.filter(x => x !== t)].slice(0, TOPIC_HISTORY_MAX);
    saveSettings();
}

function renderTopicHistoryList() {
    const history = getSettings().topicHistory;
    const $list = $('#future-observer-topic-history-list');
    $list.empty();
    if (!Array.isArray(history) || !history.length) {
        $list.html('<div class="future-observer-fandom-history-empty">还没有用过话题</div>');
        return;
    }
    for (const t of history) {
        $list.append($('<div class="future-observer-fandom-history-item future-observer-topic-history-item"></div>').text(t));
    }
}

// 刷新"同人资料"编辑区：显示当前作品的资料和来源
function refreshFandomLibraryPanel(extraNote) {
    const work = String(getSettings().fandomWork || '').trim();
    const entry = work ? getFandomLibrary()[work] : null;
    $('#future-observer-fandom-lib-text').val(entry?.text || '');
    let status;
    if (!work) status = '先在上面填作品名。';
    else if (entry?.text) status = `${entry.manual ? '手动资料' : '联网缓存'} · ${entry.source || ''} · ${entry.text.length} 字`;
    else status = '资料库里还没有这部作品的资料。生成时会自动联网查，也可以点“联网查询”，或自己写在下面。';
    $('#future-observer-fandom-lib-status').text(extraNote ? `${status}（${extraNote}）` : status);
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
    $('.future-observer-theme-select').val(THEME_NAMES.includes(settings.theme) ? settings.theme : 'aurora');
    $('#future-observer-diag-fullprompt').prop('checked', !!settings.diagFullPrompt);
    refreshDiagUI();

    $('.future-observer-perspective-select').each(function () {
        renderPerspectiveOptions($(this), settings.timeDirection, settings.identity);
    });
    $('.future-observer-topic-input').val(settings.topic || '');
    $('.future-observer-mainraw-toggle').prop('checked', !!settings.mainRaw);
    $('.future-observer-devmode-toggle').prop('checked', !!settings.devMode);
    $('.future-observer-diag-details').toggle(!!settings.devMode);
    $('#future-observer-fasttok').val(Number(settings.fastTokPerSec) || 0);
    $('.future-observer-fandom-boost-toggle').prop('checked', !!settings.fandomBoost);
    $('#future-observer-fandom-boost-wrap').toggle(settings.timeDirection === 'otherworld' && settings.identity === 'fandom');
    $('.future-observer-richness-select').val(RICHNESS_SPECS[settings.richness] ? settings.richness : 'rich');
    $('.future-observer-plan-toggle').prop('checked', settings.planFirst !== false);
    const forumModeOn = settings.forumMode === 'forum';
    $('.future-observer-mode-select').val(forumModeOn ? 'forum' : 'thread');
    // 多帖论坛模式自带论坛外观：载体在这个模式下不起作用
    $('.future-observer-skin-select').val(SKIN_SPECS[settings.skin] ? settings.skin : 'forum').prop('disabled', forumModeOn);
    $('.future-observer-hot-toggle').prop('checked', !!settings.hotComments).prop('disabled', !forumModeOn && !getSkinSpec(settings).hotAllowed);
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
    $(document).off('change.futureObserverPerspective').on('change.futureObserverPerspective', '.future-observer-perspective-select', function () {
        const settings = getSettings();
        const [dir, ident] = String($(this).val()).split(':');
        if (IDENTITY_OPTIONS[dir] && IDENTITY_OPTIONS[dir].some(o => o.value === ident)) {
            settings.timeDirection = dir;
            settings.identity = ident;
        }
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('input.futureObserverTopic change.futureObserverTopic').on('input.futureObserverTopic change.futureObserverTopic', '.future-observer-topic-input', function () {
        const settings = getSettings();
        settings.topic = String($(this).val() || '').slice(0, 200);
        saveSettings();
        $('.future-observer-topic-input').not(this).val(settings.topic);
        renderOptionChips();
    });

    $(document).off('click.futureObserverTopicArrow').on('click.futureObserverTopicArrow', '#future-observer-topic-history-arrow', function () {
        const $list = $('#future-observer-topic-history-list');
        if ($list.is(':visible')) { $list.hide(); return; }
        renderTopicHistoryList();
        $list.show();
    });

    $(document).off('click.futureObserverTopicItem').on('click.futureObserverTopicItem', '.future-observer-topic-history-item', function () {
        const settings = getSettings();
        settings.topic = $(this).text();
        saveSettings();
        $('.future-observer-topic-input').val(settings.topic);
        $('#future-observer-topic-history-list').hide();
        renderOptionChips();
    });

    $(document).off('change.futureObserverMainRaw').on('change.futureObserverMainRaw', '.future-observer-mainraw-toggle', function () {
        const settings = getSettings();
        settings.mainRaw = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverDevMode').on('change.futureObserverDevMode', '.future-observer-devmode-toggle', function () {
        const settings = getSettings();
        settings.devMode = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverFastTok').on('change.futureObserverFastTok', '#future-observer-fasttok', function () {
        const settings = getSettings();
        settings.fastTokPerSec = Math.max(0, Math.min(2000, Math.floor(Number($(this).val()) || 0)));
        $(this).val(settings.fastTokPerSec);
        saveSettings();
    });

    $(document).off('click.futureObserverRegen').on('click.futureObserverRegen', '.future-observer-regen', function () {
        if (!currentRun) generateObservation();
    });

    $(document).off('click.futureObserverInfoCopy').on('click.futureObserverInfoCopy', '.future-observer-infocopy', async function () {
        const text = String($(this).closest('.future-observer-infobar').data('copy') || '');
        const ok = text && await copyText(text);
        if (ok) toastr.success('已复制。', '观察者论坛');
        else toastr.warning('无法自动复制，请手动选中上面那行文字复制。', '观察者论坛');
    });

    // —— 同人加强：开关 + 资料库编辑 ——
    $(document).off('change.futureObserverFandomBoost').on('change.futureObserverFandomBoost', '.future-observer-fandom-boost-toggle', function () {
        const settings = getSettings();
        settings.fandomBoost = $(this).is(':checked');
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('click.futureObserverLibToggle').on('click.futureObserverLibToggle', '#future-observer-fandom-lib-toggle', function () {
        const $panel = $('#future-observer-fandom-lib-panel');
        if ($panel.is(':visible')) { $panel.hide(); return; }
        refreshFandomLibraryPanel();
        $panel.show();
    });

    $(document).off('click.futureObserverLibSave').on('click.futureObserverLibSave', '#future-observer-fandom-lib-save', function () {
        const work = String(getSettings().fandomWork || '').trim();
        if (!work) { toastr.warning('先填上面的作品名。', '观察者论坛'); return; }
        const text = String($('#future-observer-fandom-lib-text').val() || '').trim();
        const lib = getFandomLibrary();
        if (text) lib[work] = { text, source: '你手动写的资料库', time: Date.now(), manual: true };
        else delete lib[work];
        saveSettings();
        refreshFandomLibraryPanel();
        toastr.success(text ? '已保存，之后生成会优先用这份资料。' : '资料已清空。', '观察者论坛');
    });

    $(document).off('click.futureObserverLibFetch').on('click.futureObserverLibFetch', '#future-observer-fandom-lib-fetch', async function () {
        const work = String(getSettings().fandomWork || '').trim();
        if (!work) { toastr.warning('先填上面的作品名。', '观察者论坛'); return; }
        const lib = getFandomLibrary();
        if (lib[work]?.manual) { toastr.info('这份是你手动写的资料，已保留。想换成联网结果，请先清空再查询。', '观察者论坛'); return; }
        const $status = $('#future-observer-fandom-lib-status');
        $status.text('正在联网查询……');
        try {
            const res = await fetchFandomFromWeb(work);
            if (res.text) {
                lib[work] = { text: res.text, source: res.source, time: Date.now(), manual: false };
                saveSettings();
            }
            refreshFandomLibraryPanel(res.text ? '' : res.note);
        } catch (e) {
            refreshFandomLibraryPanel('查询出错：' + (e?.message || e));
        }
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
        saveSettings();
        syncControlsFromSettings();
        toastr.info('作品名 / 穿越世界已重置。', '观察者论坛');
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

    $(document).off('change.futureObserverTheme').on('change.futureObserverTheme', '.future-observer-theme-select', function () {
        const settings = getSettings();
        const v = String($(this).val());
        settings.theme = THEME_NAMES.includes(v) ? v : 'aurora';
        saveSettings();
        syncControlsFromSettings();
    });

    $(document).off('change.futureObserverMode').on('change.futureObserverMode', '.future-observer-mode-select', function () {
        const settings = getSettings();
        settings.forumMode = $(this).val() === 'forum' ? 'forum' : 'thread';
        saveSettings();
        syncControlsFromSettings();
        refreshHistoryNav(); // 两种形式的历史记录是分开的
    });

    $(document).off('click.futureObserverPostCard').on('click.futureObserverPostCard', '.future-observer-postcard', function () {
        const $box = $(this).closest('.future-observer-result');
        const idx = Number($(this).attr('data-fo-post'));
        if (!Number.isInteger(idx)) return;
        $box.data('foPost', idx);
        rerenderResultBox($box);
    });

    $(document).off('click.futureObserverPostBack').on('click.futureObserverPostBack', '.future-observer-postback', function () {
        const $box = $(this).closest('.future-observer-result');
        $box.removeData('foPost');
        rerenderResultBox($box);
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

    $(document).off('click.futureObserverDiagToggle').on('click.futureObserverDiagToggle', '.future-observer-diagtoggle', function () {
        $(this).siblings('.future-observer-diagbox').toggle();
    });

    $(document).off('click.futureObserverDiagCopy').on('click.futureObserverDiagCopy', '.future-observer-diagcopy, #future-observer-diag-copy', async function () {
        const $ta = $(this).is('#future-observer-diag-copy') ? $('#future-observer-diag-text') : $(this).siblings('.future-observer-diagtext');
        const text = String($ta.val() || '');
        const ok = text && await copyText(text);
        if (ok) {
            toastr.success('诊断报告已复制，可以直接粘贴发出。', '观察者论坛');
        } else {
            $ta.trigger('focus');
            try { $ta.get(0).select(); } catch { /* 忽略 */ }
            toastr.warning('无法自动复制：文本已全选，请长按后手动复制。', '观察者论坛');
        }
    });

    $(document).off('change.futureObserverDiagSelect').on('change.futureObserverDiagSelect', '#future-observer-diag-select', function () {
        const r = diagReports[Number($(this).val())];
        $('#future-observer-diag-text').val(r ? r.text : '');
    });

    $(document).off('click.futureObserverDiagClear').on('click.futureObserverDiagClear', '#future-observer-diag-clear', function () {
        diagReports = [];
        saveDiagReports();
        refreshDiagUI();
    });

    $(document).off('change.futureObserverDiagFull').on('change.futureObserverDiagFull', '#future-observer-diag-fullprompt', function () {
        const settings = getSettings();
        settings.diagFullPrompt = $(this).is(':checked');
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
                <select class="future-observer-perspective-select"></select>
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
                <div id="future-observer-fandom-boost-wrap" class="future-observer-fandom-boost-wrap" style="display:none;">
                    <label class="future-observer-popup-checkbox"><input type="checkbox" class="future-observer-fandom-boost-toggle"> 同人加强：生成前查维基资料，减少毁人设</label>
                    <div class="future-observer-fandom-libbar"><span id="future-observer-fandom-lib-toggle" class="future-observer-linkbtn">📚 查看/编辑资料</span></div>
                    <div id="future-observer-fandom-lib-panel" class="future-observer-fandom-lib-panel" style="display:none;">
                        <div id="future-observer-fandom-lib-status" class="future-observer-fandom-lib-status"></div>
                        <textarea id="future-observer-fandom-lib-text" class="future-observer-fandom-lib-text" rows="6" placeholder="这部作品的角色资料。留空则生成时自动联网查；手动写的内容优先级最高。"></textarea>
                        <div class="future-observer-fandom-lib-actions">
                            <button type="button" id="future-observer-fandom-lib-save" class="future-observer-reset-btn">保存为我的资料</button>
                            <button type="button" id="future-observer-fandom-lib-fetch" class="future-observer-reset-btn">联网查询</button>
                        </div>
                    </div>
                </div>
                <label class="future-observer-popup-checkbox" style="display:none;"><input type="checkbox" id="future-observer-fandom-sameworld"> 剧情本身就发生在这部作品的世界里（穿越/同人卡）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" class="future-observer-plan-toggle"> 先构思再写（更充实，更慢）</label>
                <div class="future-observer-popup-selectrow">
                    <span>主题</span>
                    <select class="future-observer-theme-select">
                        <option value="aurora">极光（随时间方向变色）</option>
                        <option value="terminal">复古终端</option>
                        <option value="blueprint">蓝图</option>
                        <option value="pop">波普漫画</option>
                        <option value="steam">蒸汽朋克</option>
                        <option value="ink">水墨</option>
                    </select>
                </div>
                <div class="future-observer-popup-selectrow">
                    <span>形式</span>
                    <select class="future-observer-mode-select">
                        <option value="thread">评论区（一个帖子）</option>
                        <option value="forum">多帖论坛（帖子列表）</option>
                    </select>
                </div>
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
                <label class="future-observer-popup-checkbox future-observer-mainraw-row"><input type="checkbox" class="future-observer-mainraw-toggle"> 走酒馆主连接时用“原始生成”（不带预设和聊天历史）</label>
                <div class="future-observer-popup-selectrow">
                    <span>内容量</span>
                    <select class="future-observer-richness-select">
                        <option value="brief">精简</option>
                        <option value="normal">标准</option>
                        <option value="rich">丰富</option>
                        <option value="epic">长篇</option>
                    </select>
                    <button type="button" id="future-observer-reset-options" class="future-observer-reset-btn" title="把作品名/穿越世界清空复位">↺ 重置</button>
                </div>
            </div>
            <div class="future-observer-history-nav">
                <button type="button" class="future-observer-history-prev menu_button" title="上一条">◀</button>
                <span class="future-observer-history-index">暂无历史</span>
                <button type="button" class="future-observer-history-next menu_button" title="下一条">▶</button>
            </div>
            <div class="future-observer-result future-observer-popup-result">点击下方“生成评论区”查看。</div>
            <div class="future-observer-topicrow">
                <div class="future-observer-topicinput-wrap">
                    <input type="text" class="future-observer-topic-input" maxlength="200" placeholder="💬 讨论话题（留空=讨论剧情）">
                    <span id="future-observer-topic-history-arrow" class="future-observer-popup-icon-btn" title="最近用过的话题">▾</span>
                </div>
                <div id="future-observer-topic-history-list" class="future-observer-fandom-history-list" style="display:none;"></div>
            </div>
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
    const targets = $('#future-observer-popup, #future-observer-settings, .future-observer-fab');
    if (!targets.length) return;
    targets.removeClass(
        'future-observer-theme-past future-observer-theme-present '
        + 'future-observer-theme-future future-observer-theme-otherworld',
    );
    targets.removeClass(THEME_NAMES.map(n => `future-observer-th-${n}`).join(' '));
    targets.addClass(`future-observer-theme-${settings.timeDirection || 'future'}`);
    targets.addClass(`future-observer-th-${THEME_NAMES.includes(settings.theme) ? settings.theme : 'aurora'}`);
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
    const forumModeChip = settings.forumMode === 'forum';
    if (forumModeChip) chips.push('多帖论坛');
    if (!forumModeChip && settings.skin && settings.skin !== 'forum') {
        chips.push((SKIN_OPTIONS.find(o => o.value === settings.skin) || { label: settings.skin }).label);
    }
    if (settings.hotComments && (forumModeChip || getSkinSpec(settings).hotAllowed)) chips.push('热评');
    if (String(settings.topic || '').trim()) chips.push('话题');
    if (settings.fandomBoost && settings.timeDirection === 'otherworld' && settings.identity === 'fandom') chips.push('同人加强');
    if (settings.protagonistMode) chips.push('主角参与');
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
