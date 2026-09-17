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
    maxChars: 14000,
    timeDirection: 'future', // 'past' | 'present' | 'future' | 'otherworld'
    identity: 'forum',
    fandomWork: '', // 异世界·同人模式指定的作品名，留空=AI自由选择
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
评论者的网名要贴合该角色的性格/身份设计（可以中二、可以霸气、可以搞笑），并且必须在网名后面用括号标注这个角色的真实姓名，方便认出是谁，格式例如：
1楼 - 疾风影帝（漩涡鸣人）：这忍术用得也太糙了吧……
3楼 - 桃芝丽庄园主（罗宾）：有点意思，这段历史我要记下来。
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

        const text = String(m.mes ?? '').trim();
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

// 每次生成时随机抽一组"楼层数量/每条字数"的范围，让每次结果的热闹程度和详细程度都有变化，
// 不再是固定死的"6~8条/20~80字"。
function pickRandomLengthSpec() {
    const countOptions = [
        [7, 10], [8, 12], [10, 14], [9, 13], [11, 16],
    ];
    const lengthOptions = [
        [40, 90], [60, 120], [80, 150], [50, 100], [100, 180],
    ];
    const [countMin, countMax] = countOptions[Math.floor(Math.random() * countOptions.length)];
    const [lenMin, lenMax] = lengthOptions[Math.floor(Math.random() * lengthOptions.length)];
    return { countMin, countMax, lenMin, lenMax };
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
    const { countMin, countMax, lenMin, lenMax } = pickRandomLengthSpec();

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
- 主贴单独一行，用下面这个固定格式标出（方便程序识别，务必照抄这个格式，不要变化）：
【主贴】某某：只有我觉得他这波操作离谱吗？
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
6. 生成 ${countMin}～${countMax} 条主楼评论，每条约${lenMin}～${lenMax}字。
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
3楼 - 某某：……${weiboBlock}
${worldInfoBlock}${memoryBlock}
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

// 把生成结果（纯文本，"1楼 - xxx：..." / "└ 2楼 - xxx 回复1楼：..." 这种格式）
// 解析成一张张"楼层卡片"。判断"是不是跟帖"用的是尽量宽松的规则——
// 这终究是在猜AI输出的文字格式，不可能100%准确，猜不中的话就当普通主楼显示，不影响阅读。
// showAdopt: 是否在每条楼层后面加"采纳"按钮（只在同人模式下才有意义，因为要靠"网名（真名）"这个格式提取真名）
function renderResultInto($el, rawText, showAdopt) {
    const text = String(rawText || '').trim();
    if (!text) {
        $el.text('没有得到结果。');
        return;
    }

    const rawLines = text.split(/\r?\n/).filter(l => l.trim());
    let html = '';
    const floorLines = []; // 跟 .future-observer-comment / .future-observer-reply 渲染顺序一一对应，用于事后挂"采纳"按钮的数据

    for (const rawLine of rawLines) {
        const hadLeadingSpace = /^[ \t　]+/.test(rawLine);
        const line = rawLine.trim();

        // 微博体的"主贴"单独识别，渲染成醒目的帖子头条样式
        const isMainPost = /^【?主贴】?/.test(line);
        if (isMainPost) {
            const cleanedPost = line.replace(/^【?主贴】?\s*[:：]?\s*/, '');
            html += `<div class="future-observer-mainpost">${escapeHtml(cleanedPost)}</div>`;
            continue;
        }

        const isReply = hadLeadingSpace
            || /^[└╰↳→>＞»]+/.test(line)
            || /回复\s*\d*\s*楼/.test(line)
            || /^楼上/.test(line);
        const cleaned = line.replace(/^[└╰↳→>＞»\-–—\s]+/, '');
        const escaped = escapeHtml(cleaned);
        html += isReply
            ? `<div class="future-observer-reply"><span class="future-observer-line-text">${escaped}</span></div>`
            : `<div class="future-observer-comment"><span class="future-observer-line-text">${escaped}</span></div>`;
        floorLines.push(cleaned);
    }

    $el.html(html || escapeHtml(text));

    if (showAdopt) {
        const floors = $el.find('.future-observer-comment, .future-observer-reply');
        floors.each(function (i) {
            const raw = floorLines[i];
            const parsed = raw ? parseFandomLine(raw) : null;
            if (!parsed) return; // 这行解析不出"网名（真名）"格式，就不加采纳按钮
            const btn = $('<button type="button" class="future-observer-adopt-btn" title="采纳到酒馆输入框">📥 采纳</button>');
            btn.data('fo-name', parsed.realName);
            btn.data('fo-content', parsed.content);
            $(this).append(btn);
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
        const prompt = await buildPrompt(story);
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

        const showAdopt = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
        resultBoxes.each(function () {
            renderResultInto($(this), result, showAdopt);
        });

        const scopeKey = getMemoryScopeKey(settings);
        await pushHistoryEntry(scopeKey, result); // 历史记录不受"记忆开关"影响，一直都会存
        historyCursor[scopeKey] = getHistoryList(scopeKey).length - 1; // 新生成的这条，游标指向最新
        refreshHistoryNav();

        if (settings.memoryEnabled) {
            await saveMemoryEntry(scopeKey, result);
        }
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
    $('#future-observer-aionly-toggle').prop('checked', !!settings.aiOnly);
    $('#future-observer-maxchars').val(settings.maxChars);
    $('#future-observer-fab-toggle').prop('checked', settings.fabEnabled !== false);
    $('#future-observer-worldinfo-toggle').prop('checked', settings.worldInfoEnabled !== false);
    $('#future-observer-popup-weibo-toggle').prop('checked', !!settings.weiboMode);
    $('#future-observer-popup-memory-toggle').prop('checked', !!settings.memoryEnabled);

    $('.future-observer-direction-select').val(settings.timeDirection);
    $('.future-observer-identity-select').each(function () {
        renderIdentityOptions($(this), settings.timeDirection, settings.identity);
    });
    applyPopupTheme();
    refreshHistoryNav();

    // 只有"异世界·同人模式"才显示作品名输入框和"同一个世界"勾选框（目前只放在悬浮球弹窗里）
    const showFandomInput = settings.timeDirection === 'otherworld' && settings.identity === 'fandom';
    $('#future-observer-fandom-work').val(settings.fandomWork || '').toggle(showFandomInput);
    $('#future-observer-fandom-sameworld').prop('checked', !!settings.fandomSameWorld).closest('label').toggle(showFandomInput);

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

    $(document).off('change.futureObserverFandomSameWorld').on('change.futureObserverFandomSameWorld', '#future-observer-fandom-sameworld', function () {
        const settings = getSettings();
        settings.fandomSameWorld = $(this).is(':checked');
        saveSettings();
    });

    $(document).off('click.futureObserverGenerate').on('click.futureObserverGenerate', '.future-observer-generate-btn', generateObservation);

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
    });

    $(document).off('change.futureObserverMemoryToggle').on('change.futureObserverMemoryToggle', '#future-observer-popup-memory-toggle', function () {
        const settings = getSettings();
        settings.memoryEnabled = $(this).is(':checked');
        saveSettings();
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
                <label class="future-observer-popup-checkbox" style="display:none;"><input type="checkbox" id="future-observer-fandom-sameworld"> 剧情本身就发生在这部作品的世界里（穿越/同人卡）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" id="future-observer-popup-weibo-toggle"> 微博体（先发主贴，评论围绕主贴讨论）</label>
                <label class="future-observer-popup-checkbox"><input type="checkbox" id="future-observer-popup-memory-toggle"> 记住上一次（参考上次同类型的讨论）</label>
            </div>
            <button class="menu_button future-observer-generate-btn">🔭 生成评论区</button>
            <div class="future-observer-history-nav">
                <button type="button" class="future-observer-history-prev menu_button" title="上一条">◀</button>
                <span class="future-observer-history-index">暂无历史</span>
                <button type="button" class="future-observer-history-next menu_button" title="下一条">▶</button>
            </div>
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

// 弹窗配色跟着"时间方向"变化：过去偏复古黄褐、未来偏科幻蓝、异世界偏紫、现在保持中性色
function applyPopupTheme() {
    const settings = getSettings();
    const popup = $('#future-observer-popup');
    if (!popup.length) return;
    popup.removeClass(
        'future-observer-popup-theme-past future-observer-popup-theme-present '
        + 'future-observer-popup-theme-future future-observer-popup-theme-otherworld',
    );
    popup.addClass(`future-observer-popup-theme-${settings.timeDirection || 'future'}`);
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
