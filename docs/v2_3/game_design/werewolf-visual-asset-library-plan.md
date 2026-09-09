# 狼人杀视觉素材库重规划

> 文档版本：v0.1
> 日期：2026-07-07
> 状态：第一批必做素材已创建并接入
> 目标：先重新定义狼人杀工具需要哪些素材、放在哪里、各自表达什么，再进入绘制和接入

## 1. 当前结论

上一版 `apps/web/public/game-tools/werewolf/ui` 素材已经撤回。

这次不再做大面积背景、厚重卡框、舞台、森林地平线这类装饰素材。狼人杀工具的核心体验是线下快速开局、选座、翻牌、法官操作和复盘，因此素材应该服务操作，而不是把页面包装成插画场景。

新的素材方向：

- 以现有 `recto` / `verso` 卡面为主视觉。
- 新素材只做“小而明确”的功能组件。
- 优先补座位、状态、动作、结算、二维码和复盘标记。
- 不在素材里写固定文案，避免三语维护困难。
- 角色身份仍然只由正面卡表达，其他素材不暗示身份或死因。

当前保留资源：

```text
apps/web/public/game-tools/werewolf/werewolf.png
apps/web/public/game-tools/werewolf/recto
apps/web/public/game-tools/werewolf/verso
```

已新建：

```text
apps/web/public/game-tools/werewolf/ui
```

第一批素材已接入页面：

- `WerewolfCreateRoomPanel`：版型玩家席、法官席。
- `WerewolfRoomOverview`：空座、已坐、准备、死亡、法官位、事件点。
- `WerewolfPrivateSeatCard`：翻牌 / 盖牌、私密提示、死亡遮罩、结算徽章、法官视图状态。
- `WerewolfQrCode`：二维码角标框。
- `WerewolfPublicScreen`：公共屏座位状态、统计块、事件点。
- `WerewolfRecapView`：结算摘要、生死状态、胜负徽章、时间线节点。
- `WerewolfTestBotPanel`：测试专用标记和测试状态。
- `/game-tools/werewolf/card-preview`：集中展示所有角色牌、背面牌、状态素材、二维码框和死亡遮罩。

## 2. 现有框架分析

| 页面 / 组件 | 当前内容 | 素材缺口 | 建议 |
| --- | --- | --- | --- |
| `WerewolfCreateRoomPanel` | 版型选择、创建房间 | 入口视觉主要靠主图和文字，版型卡片缺少直观人数感 | 补“座位数量 token”和“法官位 token”，不要补整页背景 |
| `WerewolfRoomOverview` | 房间大厅、座位、准备、开始游戏、分享 | 操作很多，玩家需要快速判断空位、已坐、已准备、法官、已出局 | 补座位状态 token、准备状态 token、法官 token |
| `WerewolfPrivateSeatCard` | 玩家私密身份页、翻牌、死亡、结算 | 翻牌和盖回动作需要更明确；死亡状态需要通用但不泄密 | 补翻牌 / 盖回动作图标、通用死亡遮罩 |
| `WerewolfQrCode` | 二维码分享 | 现在二维码是功能可用，但视觉和狼人杀工具关联弱 | 补轻量 QR 角标框，不做复杂扫码背景 |
| `WerewolfPublicScreen` | 公共屏、座位、状态、事件 | 大屏需要远距离识别，不能依赖长文字 | 补公共屏标题标记、状态 token |
| `WerewolfRecapView` | 结算、玩家结果、事件记录 | 胜负和事件线需要更图形化 | 补阵营结果徽章、事件点 |
| `WerewolfTestBotPanel` | 测试流程机器人 | 测试入口必须和正式玩法区分 | 补测试专用标记，但只在测试开关开启时使用 |

## 3. 第一批建议素材

第一批只做真正会被页面反复使用的功能型素材。

| 文件位置 | 素材内容 | 用途 | 优先级 |
| --- | --- | --- | --- |
| `apps/web/public/game-tools/werewolf/ui/seat-player-empty.svg` | 空座位小牌。奶白底、深绿细边、中心留数字区，和背面数字牌呼应，但不复制完整卡背 | 房间大厅、公共屏的空位 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/seat-player-occupied.svg` | 已有人入座小牌。比空位更实，带轻微旧金边或填充 | 房间大厅、公共屏的已占位 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/seat-player-ready.svg` | 已准备状态小章。绿色蜡封感，不写文字 | 表示玩家已准备 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/seat-player-out.svg` | 已出局状态小章。灰黑色、裂痕或月蚀感，不表示死因，不使用叉号 | 法官页、玩家页、公共屏、复盘 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/seat-judge.svg` | 法官位小章。月亮、星针或主持人印章感，不使用法律法槌语义 | 标识法官座位 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/action-reveal-card.svg` | 翻牌动作图标。卡片一角翻起，内侧有一点光 | “查看身份”按钮 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/action-cover-card.svg` | 盖回动作图标。卡背合上，中心是数字牌符号 | “盖回背面”按钮 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/reveal-confirm-mark.svg` | 私密确认小图标。手掌遮住卡面或眼睛半闭 | 翻到正面前的确认弹窗 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/death-blood-drip-effect.svg` | 出局瞬间的血幕滴落。顶部不规则血面向下流，长短血滴短暂停留后消失 | 玩家被标记死亡后的短暂动效 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/death-overlay-mask.svg` | 出局后的最终灰黑遮罩。暗场、低饱和、细纹理，不显示死因 | 死亡动效结束后的固定灰黑状态 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/qr-corner-frame.svg` | 四角式扫码框。细线、旧金角标、中心完全留白 | 二维码外框 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/result-good-badge.svg` | 好人阵营结算徽章。亮金 / 绿，太阳或村庄守护感，不写字 | 胜负动画、复盘摘要 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/result-werewolf-badge.svg` | 狼人阵营结算徽章。深红 / 黑绿，月影或爪痕，但不血腥 | 胜负动画、复盘摘要 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/timeline-event-dot.svg` | 事件时间线节点。小圆点加短线，类似卡面星点 | 复盘事件流 | 必做 |
| `apps/web/public/game-tools/werewolf/ui/test-only-badge.svg` | 测试专用标记。虚线框、工具感，明显区别正式玩法 | 测试机器人面板 | 必做 |

出局动效说明：当前 `death-blood-drip-effect.svg` 是可替换的工程占位稿，用来验证“背面牌短暂血幕滴落 + 最终背面灰黑牌面”的交互节奏。死亡公开的是出局状态，不公开身份，所以默认状态必须盖在背面牌上。最终上线前建议由美工或动效设计补一版正式素材，优先格式为 Lottie、透明 WebM 或精修 SVG。无论最终素材形式如何，都不要使用叉号、骷髅、武器或能暗示具体死因的图形。

## 4. 第二批可选素材

这些可以等第一批确认后再判断是否需要。

| 文件位置 | 素材内容 | 用途 | 是否建议马上做 |
| --- | --- | --- | --- |
| `apps/web/public/game-tools/werewolf/ui/variant-player-count-7.svg` | 7 人局人数图标，7 个小座位围成一圈 | 版型选择 | 否 |
| `apps/web/public/game-tools/werewolf/ui/variant-player-count-8.svg` | 8 人局人数图标 | 版型选择 | 否 |
| `apps/web/public/game-tools/werewolf/ui/variant-player-count-9.svg` | 9 人局人数图标 | 版型选择 | 否 |
| `apps/web/public/game-tools/werewolf/ui/variant-player-count-10.svg` | 10 人局人数图标，包含一个独立法官点位 | 版型选择 | 否 |
| `apps/web/public/game-tools/werewolf/ui/variant-player-count-12.svg` | 12 人局人数图标，包含一个独立法官点位 | 版型选择 | 否 |
| `apps/web/public/game-tools/werewolf/ui/screen-header-mark.svg` | 公共屏顶部小标记。细长月相线，不铺满背景 | 公共屏标题区 | 否 |
| `apps/web/public/game-tools/werewolf/ui/room-share-chip.svg` | 分享入口小图标。卡牌 + 链接，不写文字 | 分享按钮 | 否 |
| `apps/web/public/game-tools/werewolf/ui/sound-death-soft.mp3` | 很短、低音量、非惊吓式提示音 | 死亡动效，可由设置控制 | 否 |

## 5. 不建议补充的素材

以下类型先不做：

- 大幅森林背景。
- 大型星盘背景。
- 包住整个面板的复杂装饰框。
- 卡牌展示舞台。
- 独立死亡插画。
- 暗示狼刀、毒药、猎枪、投票等具体死因的素材。
- 带固定中文、英文或法文文案的图片。

原因：

- 页面已经有真实卡牌资源，额外大图会显得重复和生硬。
- 狼人杀工具需要快，不需要玩家阅读大量视觉提示。
- 死亡原因必须由线下法官控制，不应该由系统素材暗示。
- 文案应由组件渲染，图片只承担形状和状态表达。

## 6. 接入原则

素材确认后再接入，接入时遵循：

- 按组件需求逐个接入，不一次性铺满所有页面。
- 同一状态只用一套图形语言，例如“已出局”在房间、玩家页、公共屏、复盘都保持一致。
- 按钮仍优先使用现有图标系统，SVG 素材只补狼人杀专属语义。
- 角色卡不加额外厚边框，保持卡面完整。
- 移动端优先，所有素材必须在小屏幕下仍能看懂。

## 7. 建议执行顺序

1. 先确认第一批素材列表。
2. 生成或绘制 `seat-*`、`action-*`、`death-overlay-mask.svg`。
3. 只接入房间大厅和玩家身份页，先看操作感是否改善。
4. 确认后再补二维码、公共屏、复盘和测试面板。
5. 最后再考虑版型人数图标和音效。

## 8. 验收标准

- 素材本身不需要文字也能表达状态。
- 玩家第一眼能分清空位、已入座、已准备、法官、已出局。
- 翻牌和盖回动作比纯文字按钮更直观。
- 死亡动效通用，不泄露死因。
- 页面看起来更像一个桌游工具，而不是一套重装饰主题页。
- 卡牌仍然是视觉中心，新素材不抢走卡牌注意力。

## 9. 实施记录

已创建第一批必做素材：

```text
apps/web/public/game-tools/werewolf/ui/action-cover-card.svg
apps/web/public/game-tools/werewolf/ui/action-reveal-card.svg
apps/web/public/game-tools/werewolf/ui/death-overlay-mask.svg
apps/web/public/game-tools/werewolf/ui/death-blood-drip-effect.svg
apps/web/public/game-tools/werewolf/ui/qr-corner-frame.svg
apps/web/public/game-tools/werewolf/ui/result-good-badge.svg
apps/web/public/game-tools/werewolf/ui/result-werewolf-badge.svg
apps/web/public/game-tools/werewolf/ui/reveal-confirm-mark.svg
apps/web/public/game-tools/werewolf/ui/seat-judge.svg
apps/web/public/game-tools/werewolf/ui/seat-player-out.svg
apps/web/public/game-tools/werewolf/ui/seat-player-empty.svg
apps/web/public/game-tools/werewolf/ui/seat-player-occupied.svg
apps/web/public/game-tools/werewolf/ui/seat-player-ready.svg
apps/web/public/game-tools/werewolf/ui/test-only-badge.svg
apps/web/public/game-tools/werewolf/ui/timeline-event-dot.svg
```

已新增测试预览路由：

```text
/{locale}/game-tools/werewolf/card-preview
```

暂未创建第二批可选素材：

```text
variant-player-count-7.svg
variant-player-count-8.svg
variant-player-count-9.svg
variant-player-count-10.svg
variant-player-count-12.svg
screen-header-mark.svg
room-share-chip.svg
sound-death-soft.mp3
```
