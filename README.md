# Future Observer（未来观测）

一个 SillyTavern UI Extension。

## 功能

读取当前聊天最近 N 条消息，把它们视为“已经发生的历史”，使用当前 SillyTavern 所选的 AI 生成独立的未来评价/吐槽。

支持：
- 未来网友
- 历史学者
- 当事人后代
- 未来新闻
- 混合模式

生成结果不会写入聊天记录，也不会继续主线剧情。

## 安装

### 方法一：本地安装

把整个 `FutureObserver` 文件夹放入：

`data/<你的用户名>/extensions/`

或者按 SillyTavern 的第三方扩展方式放入对应 extensions 目录。

然后重启/刷新 SillyTavern，在扩展设置中启用。

### 方法二：Git 安装

把本文件夹上传到自己的 Git 仓库，然后在 SillyTavern：
扩展 → Install Extension → 输入仓库地址。

## 使用

在扩展区域找到“🔭 未来观测”。

选择模式，然后点击“查看未来评价”。

默认读取最近 12 条消息，可调整为 1～50 条。

## 注意

这是第一版原型。它使用 `generateRaw()` 调用当前选择的 AI，因此不会把生成结果加入当前聊天。
