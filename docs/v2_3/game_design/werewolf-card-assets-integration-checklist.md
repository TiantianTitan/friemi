# 狼人杀卡牌正反面视觉接入 Checklist

> 文档版本：v0.1
> 生成日期：2026-07-07
> 适用阶段：v2.3 狼人杀 UI 拓展优化
> 目标：把狼人杀正面角色卡和背面座位卡接入开局后的身份展示、法官视图、结算和复盘页面

---

## 1. 资源约定

当前资源目录：

```text
apps/web/public/game-tools/werewolf
```

正面角色卡：

```text
apps/web/public/game-tools/werewolf/recto/{role}_{locale}.png
```

背面座位卡：

```text
apps/web/public/game-tools/werewolf/verso/{seatNumber}.png
```

当前只有英文版正面卡，因此所有语言先使用 `_en.png`：

```text
cupid_en.png
guard_en.png
hunter_en.png
idiot_en.png
knight_en.png
lovers_en.png
seer_en.png
villager_en.png
werewolf_en.png
white_wolf_king_en.png
witch_en.png
wolf_king_en.png
```

背面卡为数字牌，不需要区分语言：

```text
1.png
2.png
...
12.png
```

## 2. 接入原则

- 狼人杀仍然是线下游戏辅助工具，不把 UI 做成完整线上游戏。
- 玩家默认看到背面卡，点击后短暂显示正面角色卡。
- 从背面切到正面前必须二次确认，避免误触泄露身份。
- 从正面切回背面不需要确认，必须快速、直接。
- 法官视图可以看到所有玩家角色卡缩略图。
- 死亡状态不能暴露死因，只表达“该玩家已出局”。
- 当前三语都 fallback 到英文正面卡。
- 后续新增中文、法语卡面时，只扩展资源和 helper，不重写页面逻辑。
- 图片缺失时必须有兜底，不让页面报错或空白。

## 3. 技术 Checklist

### 3.1 资源命名

- [x] 将旧 `mafia` 目录改为 `werewolf`
- [x] 将狼人杀主图改为 `werewolf.png`
- [x] 将正面角色卡统一为 `{role}_en.png`
- [x] 保留背面数字牌 `1.png` 到 `12.png`
- [ ] 后续新增中文正面卡 `{role}_zh-CN.png`
- [ ] 后续新增法语正面卡 `{role}_fr.png`

### 3.2 图片 helper

- [x] 新增 `getWerewolfRoleCardImage(roleKey, locale)` helper
- [x] 新增 `getWerewolfSeatBackImage(seatNumber)` helper
- [x] 当前所有 locale fallback 到 `_en.png`
- [ ] 未来优先读取当前语言资源，不存在时 fallback 到 `_en.png`
- [x] 为未知角色提供默认正面图或文字卡兜底
- [x] 为越界座位号提供默认背面图兜底

建议路径：

```text
apps/web/features/game-tools/werewolfCardAssets.ts
```

建议输出：

```ts
getWerewolfRoleCardImage("seer", "zh-CN")
// /game-tools/werewolf/recto/seer_en.png

getWerewolfSeatBackImage(7)
// /game-tools/werewolf/verso/7.png
```

### 3.3 玩家私密身份页

- [x] 未发身份时显示背面卡或等待状态
- [x] 已发身份但未翻开时显示当前座位号背面卡
- [x] 点击“查看我的角色”后先弹出确认，确认后才翻到正面角色卡
- [x] 从正面切回背面不弹确认，点击后立刻盖回
- [x] 正面显示 2 秒后自动翻回背面
- [x] 玩家可以重复点击查看
- [x] 玩家身份页自动同步房间状态，用于接收发牌、死亡、复活和结算更新
- [x] 游戏进行中玩家身份页使用全屏卡牌舞台，不再在小框里展示卡片
- [x] 游戏进行中玩家身份页不显示底部角色解释框，避免现场泄露或干扰
- [x] 死亡触发时自动盖回背面，避免因出局暴露身份
- [x] 死亡后背面卡牌从彩色过渡到灰色 / 黑白状态
- [x] 死亡瞬间在背面牌上使用上方血幕向下滴落的通用动效，动效结束后消失
- [x] 死亡遮罩覆盖在背面牌上，最终保留灰黑状态
- [x] 死亡后保留背面 / 正面翻牌规则，不因为死亡泄露身份
- [x] 死亡后本人确认查看身份时，短暂正面不叠加死亡遮罩，2 秒后回到背面死亡状态
- [x] 结算后可显示角色正面卡和胜负状态

重点页面：

```text
apps/web/features/game-tools/components/WerewolfPrivateSeatCard.tsx
```

### 3.4 死亡动效

- [x] 法官点击“标记死亡”时仍需要确认，避免误操作
- [x] 法官确认天亮 / 确认死亡状态后，对应玩家端触发死亡动效
- [x] 死亡动效使用通用血幕视觉，不区分狼刀、毒药、猎枪、投票或其他死因
- [x] 动效可以包含短暂震动，但必须检测浏览器支持
- [ ] 动效可以包含短音效，但默认应克制，避免打断线下主持
- [x] 震动和音效失败时不影响死亡状态更新
- [x] 动效结束后，玩家卡片默认固定为背面灰色 / 黑白状态
- [x] 法官页、房间页、公共屏和复盘页使用同一套死亡视觉语言
- [x] 死亡文案只使用“你已出局 / 已出局 / 死亡”等通用表达
- [x] 不出现“被狼人击杀”“被毒死”“被带走”等会泄露死因的表达

建议实现：

```text
视觉：卡牌轻微震动 -> 暗色遮罩 -> 彩色逐渐变灰
触觉：navigator.vibrate([80, 40, 80])
声音：短促低音效，可后续再接入开关
```

重点页面：

```text
apps/web/features/game-tools/components/WerewolfPrivateSeatCard.tsx
apps/web/features/game-tools/components/WerewolfRoomOverview.tsx
apps/web/features/game-tools/components/WerewolfPublicScreen.tsx
apps/web/features/game-tools/components/WerewolfRecapView.tsx
```

### 3.5 法官视图

- [x] 法官页玩家列表显示角色缩略图
- [x] 未开局前不显示角色图
- [x] 开局后显示所有玩家角色正面缩略图
- [x] 死亡玩家角色卡置灰
- [x] 标记死亡 / 取消死亡按钮不遮挡角色图
- [x] 标记死亡只记录“死亡状态”，不记录公开死因
- [x] 移动端法官页仍保持可快速操作

重点页面：

```text
apps/web/features/game-tools/components/WerewolfPrivateSeatCard.tsx
apps/web/features/game-tools/components/WerewolfRoomOverview.tsx
```

### 3.6 房间页

- [x] 普通房间页不开局前只展示座位状态
- [x] 已结束后可展示角色缩略图
- [x] 玩家身份不在公开房间页提前泄露
- [x] 当前用户的“身份页”入口保持明显

重点页面：

```text
apps/web/features/game-tools/components/WerewolfRoomOverview.tsx
```

### 3.7 公共屏

- [x] 公共屏默认不展示私密角色
- [x] 游戏结束后可以展示所有角色卡
- [x] 死亡状态用灰度、透明度或角标表达
- [x] 死亡状态不显示死因
- [x] 大屏布局不依赖大量文字说明

重点页面：

```text
apps/web/features/game-tools/components/WerewolfPublicScreen.tsx
```

### 3.8 复盘页

- [x] 复盘玩家列表展示座位号、昵称、角色卡、阵营、胜负
- [x] 使用角色卡减少文字密度
- [x] 胜负结果用颜色和图标表达
- [x] 复盘页默认只显示死亡状态，不展示死因字段
- [x] 保持移动端单列可读

重点页面：

```text
apps/web/features/game-tools/components/WerewolfRecapView.tsx
```

## 4. 多语言策略

当前阶段：

```text
zh-CN -> *_en.png
en    -> *_en.png
fr    -> *_en.png
```

未来阶段：

```text
zh-CN -> *_zh-CN.png，不存在则 *_en.png
en    -> *_en.png
fr    -> *_fr.png，不存在则 *_en.png
```

Checklist：

- [x] helper 中集中处理语言 fallback
- [x] 页面组件不直接拼图片路径
- [x] 新增语言卡面时不需要修改业务组件
- [ ] 缺失资源在本地开发时容易发现

## 5. 移动端体验 Checklist

- [x] 卡牌使用固定比例，避免图片加载后布局跳动
- [x] 翻牌按钮足够大，适合单手点击
- [ ] 底部导航不遮挡卡牌和主按钮
- [ ] 卡面不被裁切到看不清角色名
- [ ] 横向不会溢出
- [ ] 死亡、胜利、失败动画不遮挡系统级返回和导航
- [ ] WebView 和移动浏览器表现一致

## 6. UI 素材状态

上一版 `apps/web/public/game-tools/werewolf/ui` 素材已撤回。

撤回原因：

- 装饰性偏强，和真实玩家的操作场景贴合不够。
- 大背景、大框和舞台类素材容易抢走卡牌本身的注意力。
- 多处素材承担的是纯装饰作用，对“入座、准备、翻牌、死亡、复盘”等关键操作帮助有限。
- 当前狼人杀工具更适合使用轻量、功能型、可复用的小素材，而不是整页氛围插画。

当前保留资源：

```text
apps/web/public/game-tools/werewolf/werewolf.png
apps/web/public/game-tools/werewolf/recto
apps/web/public/game-tools/werewolf/verso
```

当前处理：

- [x] 删除旧 `ui` 素材文件
- [x] 移除页面中对旧 `ui` 素材的引用
- [x] 保留角色正面卡和座位背面卡
- [x] 按新的素材库规划创建第一批必做素材
- [x] 将第一批素材接入创建页、房间页、身份页、二维码、公共屏、复盘页和测试助手
- [x] 新增卡牌和效果预览路由 `/game-tools/werewolf/card-preview`
- [ ] 第二批可选素材按实际需要再补

新的素材库规划文档：

```text
docs/v2_3/game_design/werewolf-visual-asset-library-plan.md
```

## 7. 测试助手 Checklist

用途：

```text
测试阶段快速跑通狼人杀流程，不作为正式玩法的一部分。
```

开关：

```text
本地开发：默认开启
预览环境：设置 ENABLE_WEREWOLF_TEST_BOTS=1 后开启
生产环境：默认关闭
```

Checklist：

- [x] 房间页仅房主可见测试助手
- [x] 服务端 action 二次校验测试开关，关闭时拒绝执行
- [x] 服务端 action 二次校验房主身份，非房主不能执行
- [x] 候场阶段可以一键补满测试玩家
- [x] 候场阶段可以一键全员准备
- [x] 候场阶段可以一键补满、准备并开局
- [x] 玩家真人坐法官位时，机器人可以补满玩家座位
- [x] 法官位为空时，机器人可以补上测试法官
- [x] 游戏中可以按简化狼人杀规则随机推进夜晚 / 白天
- [x] 测试推进遵循基础身份规则：狼人落刀、女巫救 / 毒、白天投票、猎人带人、白痴免死
- [x] 测试推进达到胜利条件时自动结算
- [x] 游戏中可以随机复活已出局玩家
- [x] 游戏中可以直接测试好人胜 / 狼人胜结算
- [x] 测试推进不在玩家可见 UI 中公开死因
- [x] 测试助手结算不写入个人战绩记录
- [x] 测试助手不需要新增数据库表或迁移
- [ ] 正式部署前移除测试入口，或确保生产环境没有开启测试开关

## 8. 验收 Checklist

- [ ] 创建狼人杀房间
- [ ] 玩家入座
- [ ] 全员准备
- [ ] 法官发身份
- [x] 玩家身份页默认显示背面卡
- [x] 玩家点击查看角色时需要确认
- [x] 玩家确认后显示正面角色卡
- [x] 玩家点击盖回背面时不需要确认
- [x] 2 秒后自动翻回背面
- [x] 法官可以看到所有角色缩略图
- [x] 法官可以标记死亡 / 取消死亡
- [x] 法官确认死亡后，对应玩家端出现通用死亡动效
- [x] 死亡动效不暴露死因
- [x] 死亡玩家卡牌从彩色变成灰色 / 黑白色
- [x] 支持震动或音效时可以触发，不支持时不影响流程
- [ ] 法官结束游戏
- [x] 玩家看到胜负和角色卡
- [x] 复盘页显示角色卡
- [x] 公共屏不提前泄露私密身份
- [x] `npm run typecheck --workspace=apps/web` 通过
- [x] `npm run test --workspace=apps/web` 通过
- [x] `git diff --check` 通过
