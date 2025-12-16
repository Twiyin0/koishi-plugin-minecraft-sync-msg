# koishi-plugin-minecraft-sync-msg

[![npm](https://img.shields.io/npm/v/koishi-plugin-minecraft-sync-msg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-minecraft-sync-msg)

`v2.x` mc插件已更换为 [鹊桥](https://github.com/17TheWord/QueQiao) 同时支持插件服与MOD服
`v1.x` mc插件已停止维护，但可以继续使用 [chatSocketServer-spigot](https://github.com/Twiyin0/chatSocketServer-spigot) 仅支持插件服(1.13~1.21)
使用详情查看  
* [音铃的博客(v2.x)](https://blog.iin0.cn/views/myblog/mc/wskoishitomc.html)
* [音铃的博客(v1.x)](https://blog.iin0.cn/views/myblog/mc/koishiandmc.html)

**注意**  
rcon并非完全跟控制台一样所有命令都会有反馈

# CHANGELOG
## v2.3.0
### 新增
* 支持Reuseable，支持Dispose
* 现在可以正经的复用插件了

## v2.2.5
### 修复
* 支持QueQiao 0.3.x

## v2.2.3
### 修复
* 现在插件会回复群名片而非id了

## v2.2.0
### 新增
* 支持QueQiao APIV2

## v2.1.0-beta.1
### 修复
* 修复图片发消息至Minecraft时会有报错
* 修复订阅事件不生效的BUG

## v2.1.0-beta
### 新增
* 新增了本地化，现在可以对事件发送消息进行自定义了
* 新增插件提示，有些需要注意的地方强调了一下

### 修改
* 修改了mc发送到平台时的限制（之前限制了语音和视频）

## v2.0.8
### 优化
* 简化at元素
* 修复RCON禁止的指令不生效

## v2.0.7
### 优化
* 简化一些消息元素
* 作为服务端使用时支持[chatImage](https://github.com/kitUIN/ChatImage) MOD

## v2.0.6
### 修复
* 修复了作为服务端时koishi消息无响应的问题
* 修复服务端部分类型消息无处理的问题

## v2.0.5
### 修复
* 修复了作为服务端时koishi插件钩子报错的问题

## v2.0.4
### 修复
* 修复了一下重连导致多个客户端连接的问题
* 重构了我的垢使代码

## v2.0.4-beta
### 修复
* 修复了一下重连导致多个客户端连接的问题

## v2.0.3
### 更新
感谢[@17TheWord](https://github.com/17TheWord)大佬的支持
* 映射了NeoForge的事件，感谢[@17TheWord](https://github.com/17TheWord)大佬的PR

## v2.0.2
### 修复
* 修复重连无法接收消息的问题（log可能会跳多次重连，但这些都不重要，mc的消息只会发送一条）
### 新增
对使用[chatImage](https://github.com/kitUIN/ChatImage) MOD的用户进行了一些玩法优化

## v2.0.1
### 修复
* 修复v端无法使用的问题
* 修复无法重连，或者重连任继续重连的问题

## v2.0.0
经本人测试该插件整体趋向稳定，可以作为正式版发布，非常感谢koishi开发群各位大佬的支持以及各位用户的反馈
### 更新
* 已支持koishi作为ws服务端给鹊桥连接
* 加入了原版端的聊天、加入以及离开的事件的映射
### 修复
* 修复了ws作为客户端无法重连的问题

## v2.0.0-beta.5
### 修复
* 删除debug的命令，防止误操作

## v2.0.0-beta.4
### 修复
* 修复事件无法正常订阅的问题

## v2.0.0-beta.3
### 修复
* 修复开启插件会报错`TypeError: input is not iterable`的问题

## v2.0.0-beta.2
### 更新
* 由于fabric与forge的监听事件与spigot不同，因此对其进行了映射，不过需要注意的是`forge`不支持`PlayerCommandPreprocessEvent`事件，即使订阅了该事件也无法监听

## v2.0.0-beta.1
教程更新为[v2.0](https://twiyin0.github.io/blogs/myblog/mc/wskoishitomc.html)
### 更新
* 更新了使用的协议，使用Websocket协议连接mc服务器
* mc服务端插件更换为[鹊桥](https://github.com/17TheWord/QueQiao)支持插件服与MOD服
### 优化
* 优化了配置项的排列

## v1.1.0
### 新增
* 新增配置项，可以配置是否使用socket发送消息（关闭此项可以仅用RCON）
### 修复
* 修复插件重载配置后进行多次连接的问题（每次重载都能重新连接socket啦）

## v1.0.2
### 新增
* 为了适配mc插件端新增token配置项，用于验证身份，如果你的插件版本还没更新，这个配置项可以留空

## v1.0.0
### 修改
* 开放消息发送前缀与命令发送前缀修改配置项
* 转为正式版(ver 1.0.0， 出bug的概率小)

## v0.3.0
### 修复
* 修复机器人只能广播一次消息的问题，非常感谢开发群的各位大佬
### 修改
* 将RCON密码配置项改为不看见格式

## v0.2.1
### 修复
* 加入配置项`toGBK`可以选择是否将消息转为GBK格式
* 目前支持`GBK`与`UTF8`两种格式接收mc服务器的聊天消息

## v0.2.0
### 更新
* 加入新的配置项`chatOnly`开启则只接收聊天消息
* (如果你的chatSocketServer版本为v1.0.1)群友发送tps/TPS/服务器信息/server_info触发mc插件对应响应
### 修复
* 修改了`无响应`为`无反馈`,实际上是有相应的，只是没有反馈
* 聊天前缀、命令前缀只能在对应频道（群聊）或者koishi沙盒触发
### 一点小建议
* 由于RCON不像控制这么灵活，因此rcon发送的命令简易在前面加上插件名（父级）
示例:  
/tps ==> /spigot:tps  
/status ==> /cmi:cmi status

## v0.1.2
### 修复
* 修复超管不启用的小问题

## v0.1.1
### 修改
* 将replace改成replaceAll替换全局

## v0.1.0
### 发布
插件发布啦！
