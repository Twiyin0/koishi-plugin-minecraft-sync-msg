# koishi-plugin-minecraft-sync-msg

[![npm](https://img.shields.io/npm/v/koishi-plugin-minecraft-sync-msg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-minecraft-sync-msg)

使用详情查看 [音铃的博客](https://twiyin0.github.io/blogs/myblog/mc/wskoishitomc.html)

**注意**  
rcon并非完全跟控制台一样所有命令都会有反馈

# CHANGELOG
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
