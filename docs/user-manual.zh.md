# nex-note 用户手册

更新日期：2026-06-11。本手册说明 nex-note 当前面向用户的主要功能。键盘和鼠标快捷键另见 [keyboard-shortcuts.md](./keyboard-shortcuts.md)。

语言：[Deutsch](./user-manual.md)、[English](./user-manual.en.md)、[Français](./user-manual.fr.md)、[Español](./user-manual.es.md)、[中文](./user-manual.zh.md)。

## nex-note 是什么

nex-note 是面向 MuseScore 类工作流的 MusicXML 编辑器。你可以导入乐谱，在浏览器中直接编辑记谱，使用 AI 助手修改乐谱，播放结果，并导出为 MXL、ABC、练习包或 nex-note 项目文件。

## 开始和文件

| 功能 | 说明 |
| --- | --- |
| 新建乐谱 | 创建空白乐谱。 |
| 选择模板 | 打开包含乐器、模板和乐谱信息的设置对话框。 |
| 打开文件 | 导入本地文件。 |
| 拖放上传 | 通过上传区域加载文件。 |
| 最近文件 | 重新打开最近导入的文件。 |
| 乐谱库 | 打开本地保存的乐谱。 |

支持格式包括 `.musicxml`、`.xml`、`.mxl`、`.pdf`、`.mscz`、GuitarPro 文件（`.gp`、`.gp4`、`.gp5`、`.gp6`、`.gpx`）和 `.nxn` 项目文件。PDF 导入需要 Audiveris；MSCZ、GuitarPro、MIDI 以及最佳 ABC 导出依赖 MuseScore CLI。

## 创建新乐谱

| 区域 | 功能 |
| --- | --- |
| 选择乐器 | 搜索、按家族筛选、添加、移除和重新排序乐器。 |
| 使用模板 | 从预设编制开始。 |
| 乐谱信息 | 设置标题、副标题、作曲者、编曲者、调号、拍号和拍单位。 |

乐器顺序会成为谱表顺序。

## 主工作区

| 区域 | 用途 |
| --- | --- |
| 乐谱视图 | 渲染后的记谱、选择、导航、幽灵音符目标和播放光标。 |
| 记谱工具栏 | Undo/redo、播放、速度、节拍器、音符输入、Lead 模式、拖动移调和布局清理。 |
| 音符输入工具栏 | 时值、变音记号、奏法、声部、插入/覆盖、和弦符号、休止符、复制/粘贴/删除。 |
| 编辑面板 | 选择、移调、奏法、力度、连线和小节线。 |
| 工作区侧栏 | AI、Library 和 Inspector，可折叠。 |
| 底部控制 | Navigator、Find/Go to、缩放和视图模式。 |

## 语言和帮助

顶部栏提供紧凑的语言选择器。nex-note 支持 Deutsch、English、Français、Español 和 中文。所选语言会保存在本地，下次启动时自动恢复，并且无需重新加载即可更新界面。**Manual** 链接会打开当前语言对应的手册。

## 选择和导航

点击音符会选中它并播放短预览。点击空白区域会清除选择。`Shift+Click` 扩展范围选择，`Cmd/Ctrl+Click` 添加或移除选择。左右方向键在音符间移动，`Shift+方向键` 扩展选择，`Cmd/Ctrl+左右方向键` 按小节跳转，`Alt/Option+上下方向键` 在同一时间点的声部或谱表间垂直移动。

Find/Go to 可从底部按钮或 `Cmd/Ctrl+F` 打开，支持小节号和 `p2` 这类页面目标。

## 音符输入

使用工具栏按钮或 `N` 开启 Note Input。

| 功能 | 说明 |
| --- | --- |
| 时值 | `1` 到 `9` 选择 64 分音符到 longa；`8` 是倍全音符，`9` 是 longa。 |
| 附点 | `.` 开关附点时值。 |
| 音高 | `A` 到 `G` 输入或修改音符。 |
| 休止符 | `R` 或 `0` 插入当前时值的休止符。 |
| 重复 | 已输入音符后，`R` 可重复最后一次输入。 |
| 声部 | 工具栏或 `Cmd/Ctrl+Alt/Option+1...4`。 |
| 插入/覆盖 | `I` 切换输入行为。 |
| 和弦 | Chord Input 模式或 `Shift+A...G` 添加和弦音。 |
| 光标插入 | `Cmd/Ctrl+Shift+A...G` 明确在光标位置插入。 |
| 八度 | `Shift+上下方向键` 或 `Cmd/Ctrl+上下方向键`。 |

鼠标输入时，幽灵音符会显示下一个音符的位置。`Shift` 偏向插入，`Alt/Option` 偏向加入和弦。

## 音高、变音记号和时值

选中音符后，可以使用 `A` 到 `G`、音高按钮、方向键或编辑面板修改。`上下方向键` 按半音移调。`Q/W` 缩短或加倍时值，`Shift+Q/W` 对附点时值执行对应操作。工具栏提供变音记号；`-` 是降号，`=` 是还原号，`+` 是升号。重降号和重升号也在工具栏中。

## 奏法、力度和连线

| 区域 | 功能 |
| --- | --- |
| 奏法 | Staccato、staccatissimo、accent、marcato、tenuto、fermata。 |
| 力度 | `pp`、`p`、`mp`、`mf`、`f`、`ff`、`fff`、`sfz`。 |
| Tie | 连接到下一个同音高音符。快捷键：`T`。 |
| Slur | 跨选择范围或下一个音符。快捷键：`S`。 |
| Grace note | 在选择处添加装饰音。快捷键：`/`。 |
| Tuplets | 三连音和五连音，可用工具栏/面板或 `Cmd/Ctrl+3`、`Cmd/Ctrl+5`。 |

部分记谱符号在当前播放引擎中可能只是视觉效果。

## 小节线、反复和斜线

编辑面板可在所选小节设置 regular、double、final、repeat start 和 repeat end 小节线。Inspector 可添加反复开始/结束和第一/第二结尾。音符输入工具栏可插入节奏斜线，或用 `Cmd/Ctrl+/` 将当前小节填满斜线。

## 和弦符号、歌词和文本

选择音符后，`Cmd/Ctrl+K` 会在谱面当前位置直接打开和声输入光标；`Enter` 应用，`Escape` 取消。没有选中音符时，`Cmd/Ctrl+K` 仍会打开 Command Center。Inspector 可添加排练标记、谱表文字、表情文字和歌词。添加歌词时，先选择音符，再输入文本和段落编号，然后附加歌词行。

## Inspector

| 区域 | 功能 |
| --- | --- |
| Selection | 范围移调、清除奏法、切换 staccato/accent、添加 `mf`、切换 slur。 |
| Score Setup | 标题、副标题、作曲者、编曲者。 |
| Key | C、G、D、A、F、Bb 大调预设。 |
| Repeats & Endings | 反复开始、反复结束、第一结尾、第二结尾。 |
| Time & Clef | 4/4、3/4、6/8、2/2；高音、低音、中音谱号。 |
| Measure | 插入/删除小节、系统换行、分页、谱表间距。 |
| Text & Rehearsal | 排练标记和谱表文字。 |
| Lyrics | 给所选音符添加歌词。 |
| Parts & Instruments | 分谱名称、缩写、乐器名、移调、分谱提取、布局预设。 |

分谱提取会把单独声部作为新的工作乐谱打开。

## 编辑面板

左侧编辑面板可以展开、折叠或使用图标栏模式。它包含选择工具、按八度/半音/全音/纯五度移调、奏法、力度、tie/slur 和小节线。没有兼容选择时，相关工具会禁用。

## 播放

播放功能包括 play/pause（`Space`）、stop、速度滑块、节拍器、进度条跳转和乐谱光标。如果播放已停止且有选中音符，Play 会从该音符开始。首次加载 MIDI 或 soundfont 可能需要片刻。

## AI 助手

AI 标签页会打开聊天面板，用自然语言处理乐谱工作。你可以直接描述要做的修改，也可以使用 `/arrange`、`/analyze`、`/practice`、`/layout`、`/repair` 以及 MIDI/导入清理等 slash 工作流。如果当前选中了音符、范围、小节或声部，助手会收到这个上下文，并把建议限制在相关音乐上。

编曲请求现在会使用编曲助手。由提供方生成的计划会先经过 critic 检查；如果乐谱上下文允许，会被实现为写出的声部和和弦符号。结果会以预览形式显示，列出准备执行的操作，例如清空目标声部范围、插入实现后的音符、添加和弦；如果有配对的吉他 TAB 谱表，并且音符可演奏，也会同步镜像。

编曲、布局修改和其他风险较高的批量操作都会停留在预览确认状态。预览出现时，乐谱还没有被修改。点击 **Apply** 或输入 `apply` 会把操作写入乐谱；点击 **Cancel** 或输入 `cancel` 会放弃。预览会列出受影响小节、风险、验证信息以及准备好的命令摘要。

提供方在 **AI model settings** 中配置。Claude 和 Gemini 需要在这里填写 API key；Ollama 使用你的本地 Ollama 服务器，可以选择发现到的模型，也可以添加自定义 `model:tag`。当前提供方和模型会显示在顶部栏，并出现在助手回复中。

如果没有配置提供方、提供方调用失败，或者请求匹配确定性的本地工作流，nex-note 会使用本地辅助逻辑。它们可以分析乐谱、建议练习版本、准备和弦/表情预览、处理简单编曲，并在不把乐谱发送到云提供方的情况下运行布局清理。会修改乐谱的本地 fallback 仍然使用同样的 preview/apply/cancel 模型。

## AI 提供方和 Benchmark

nex-note 支持 Ollama、Claude、Gemini 和 Benchmark 模式。Ollama 模型可从发现列表中选择，也可用 `model:tag` 添加自定义模型。Benchmark 比较输出、延迟、XML 有效性和操作列表。CLI benchmark 可使用 `npm run benchmark` 和 `npm run benchmark:quick`。

## Library 和最近文件

Library 将乐谱保存到浏览器本地存储。你可以打开乐谱、标记收藏、按标题或格式筛选、查看统计、删除单个乐谱或清空全部。Recent Files 提供最近文件快速入口。

## 导出和保存

| 功能 | 结果 |
| --- | --- |
| Save as library score | 保存到本地 Library。 |
| Save project `.nxn` | 下载可编辑的 nex-note 项目。 |
| Export compressed MusicXML | 下载 `.mxl`。 |
| Export ABC notation | 下载 `.abc`。 |
| Export practice pack | 创建 JSON 练习包。 |
| Print view / Print score | 打开页面预览或浏览器打印。 |

MXL 是与 MuseScore、Finale、Dorico 和 Sibelius 往返的主要格式。

## 布局和视图

缩放、视图模式、Navigator、Find/Go to、Layout Cleanup、系统/页面换行、谱表间距，以及 `Compact`、`Balanced`、`Roomy`、`Choir` 分谱布局预设，可用于整理可读页面。

## Undo、Redo 和历史

Undo：`Cmd/Ctrl+Z`。Redo：`Cmd/Ctrl+Shift+Z` 或 `Cmd/Ctrl+Y`。历史记录基于命令并有长度限制，因此大量修改后较早步骤可能被丢弃。

## Debug 和问题报告

Debug 模式下，`Report bug` 会导出包含乐谱、运行状态、最近操作、Markdown/JSON 报告的包。Doctor Mode 和可视化调试工具可帮助诊断音符输入、节奏、布局和语义网格问题。

## 已知限制

AI 质量取决于提供方和模型。PDF 导入依赖 Audiveris。MSCZ、GuitarPro、MIDI 和最佳 ABC 输出依赖 MuseScore CLI。部分记谱符号对播放可能只是视觉效果。部分 MuseScore/Finale 风格快捷键仍缺失；见 [keyboard-shortcuts.md](./keyboard-shortcuts.md)。
