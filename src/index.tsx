import { Context, Schema, Logger, h, Bot, Fragment } from 'koishi'
import { WebSocket, RawData } from 'ws'
import { Rcon } from 'rcon-client'
import { getListeningEvent, getSubscribedEvents, wsConf, rconConf, Translate, resolveTranslate } from './values'
import mcWss from './mcwss'
import zhCN from './locale/zh-CN.yml'
import enUS from './locale/en-US.yml'

export const name = 'minecraft-sync-msg'

const logger = new Logger('minecraft-sync-msg')

interface MessageColor {
  output: string
  color: string
}

interface WsMessageData {
  api: string
  data: {
    message: [
      {
        text: string
        color?: string
      }
    ]
  }
}

class MinecraftSyncMsg {
  private ws: WebSocket | undefined
  private rcon: Rcon
  private isDisposing = false
  private reconnectAttempts = 0
  private reconnectIntervalId: NodeJS.Timeout | null = null
  private pl_fork: any
  private enUS:any
  private zhCN:any

  constructor(private ctx: Context, private config: MinecraftSyncMsg.Config) {
    this.initialize()
  }

  private initialize() {
    this.setupRcon()
    this.setupWebSocket()
    this.setupMessageHandler()
    this.setupDisposeHandler()
    this.ctx.i18n.define('zh-CN', zhCN)
    this.ctx.i18n.define('en-US', enUS)
  }

  /** i18n 渲染辅助：返回拼接后的纯文本 */
  private t(key: string, args?: any[]): string {
    const locale = this.config.locale || 'zh-CN'
    return this.ctx.i18n.render([locale], [key], args || {})
      .map((el: any) => el.attrs?.content ?? el.content ?? '').join('')
  }

  private setupRcon() {
    if (!this.config.rconEnable) return

    this.rcon = new Rcon({
      host: this.config.rconServerHost,
      port: this.config.rconServerPort,
      password: this.config.rconPassword,
    })

    this.connectToRcon().catch(err => {
      logger.error('RCON服务器连接失败:', err)
    })
  }

  private async connectToRcon() {
    try {
      await this.rcon.connect()
      logger.info('已连接到RCON服务器')
    } catch (err) {
      logger.error('连接到RCON服务器时发生错误:', err)
      throw err
    }
  }

  private setupWebSocket() {
    if (this.config.wsServer === '服务端') {
      this.pl_fork = this.ctx.plugin(mcWss, this.config)
      return;
    }
    else
      this.connectWebSocket()
  }

  private connectWebSocket() {
    const headers = {
      "x-self-name": this.config.serverName,
      "Authorization": `Bearer ${this.config.Token}`,
      "x-client-origin": "NOTkoishi"
    }

    this.ws = new WebSocket(`ws://${this.config.wsHost}:${this.config.wsPort}/minecraft/ws`, {
      headers
    })

    this.bindWebSocketEvents()
  }

  private bindWebSocketEvents() {
    if (!this.ws) return

    this.ws.on('open', () => this.handleWsOpen())
    this.ws.on('message', (buffer) => this.handleWsMessage(buffer))
    this.ws.on('close', () => this.handleWsClose())
    this.ws.on('error', (err) => this.handleWsError(err))
  }

  private handleWsOpen() {
    logger.info(this.t('minecraft-sync-msg.connection.connectedToWS'))

    if (!this.config.hideConnect) {
      this.broadcastToChannels(this.t('minecraft-sync-msg.connection.connectedToWS'))
    }

    const msgData: WsMessageData = {
      "api": "broadcast",
      "data": {
        "message": [
          {
            "text": this.extractAndRemoveColor(this.config.joinMsg).output,
            "color": this.extractAndRemoveColor(this.config.joinMsg).color || "gold"
          }
        ]
      }
    }

    this.ws?.send(JSON.stringify(msgData))
  }

  private handleWsMessage(buffer: RawData) {
    // Convert RawData to string
    const dataStr = buffer.toString()
    let data: any

    try {
      data = JSON.parse(dataStr)
    } catch (err) {
      logger.error('Failed to parse WebSocket message:', err)
      return
    }
    
    const eventName = data.event_name ? getListeningEvent(data.event_name) : ''

    if (!getSubscribedEvents(this.config.event).includes(eventName)) return;
  
    let sendMsg: any = h.unescape(data.message ? data.message : data.command ? data.command : '')
      .replaceAll('&amp;', '&')
      .replaceAll(/<\/?template>/gi, '')
      .replaceAll(/§./g, '')
    sendMsg = sendMsg.replaceAll(/<json.*\/>/gi, this.t('minecraft-sync-msg.message.jsonPlaceholder'))

    const imageMatch = sendMsg.match(/(https?|file):\/\/.*\.(jpg|jpeg|webp|ico|gif|jfif|bmp|png)/gi)
    const sendImage = imageMatch?.[0]

    if (sendImage) {
      sendMsg = sendMsg.replace(sendImage, `<img src="${sendImage}" />`)
    }

    if (eventName === 'PlayerDeathEvent' && data.player) {
      // v0.4.1+: death 是 Translate 对象；旧版 death.text 或 data.message
      const deathText = data.death?.text
        ?? (data.death?.key ? resolveTranslate(data.death as Translate) : null)
        ?? data.message ?? ''
      sendMsg = this.t(`minecraft-sync-msg.action.${eventName}`, [data.player?.nickname, deathText])
    } else if (eventName === 'PlayerAchievementEvent' && data.player) {
      // v0.4.1+: achievement.translate；旧版 achievement.text
      const achieveText = data.achievement?.translate?.text
        ?? (data.achievement?.translate ? resolveTranslate(data.achievement.translate as Translate) : null)
        ?? data.achievement?.text ?? ''
      sendMsg = this.t(`minecraft-sync-msg.action.${eventName}`, [data.player?.nickname, achieveText])
    } else {
      sendMsg = this.t(`minecraft-sync-msg.action.${eventName}`, [data.player?.nickname, sendMsg])
    }
    
    if (data.server_name && sendMsg) {
      this.broadcastToChannels(sendMsg)
    }
  }

  private handleWsClose() {
    if (this.isDisposing) return

    if (!this.config.hideConnect) {
      this.broadcastToChannels(this.t('minecraft-sync-msg.connection.disconnectedFromWS'))
    }

    logger.error(this.t('minecraft-sync-msg.connection.disconnectedFromWS'))
    this.ws = undefined
    this.reconnectWebSocket()
  }

  private handleWsError(err: Error) {
    if (this.isDisposing) return

    if (!this.config.hideConnect) {
      this.broadcastToChannels(this.t('minecraft-sync-msg.connection.connectionErrorWS'))
    }

    logger.error(this.t('minecraft-sync-msg.connection.connectionErrorWS'), err)
  }

  private async reconnectWebSocket() {
    this.clearReconnectInterval()

    this.reconnectIntervalId = setInterval(async () => {
      if (this.reconnectAttempts >= this.config.maxReconnectCount) {
        logger.error(`已达到最大重连次数 (${this.config.maxReconnectCount} 次)，停止重连。`)
        this.clearReconnectInterval()
        return
      }

      this.reconnectAttempts++
      logger.info(`尝试第 ${this.reconnectAttempts} 次重连...`)

      try {
        const headers = {
          "x-self-name": this.config.serverName,
          "Authorization": `Bearer ${this.config.Token}`,
          "x-client-origin": "koishi"
        }

        const ws = new WebSocket(`ws://${this.config.wsHost}:${this.config.wsPort}/minecraft/ws`, {
          headers
        })

        ws.on('open', () => {
          logger.info('WebSocket 重连成功')
          this.clearReconnectInterval()
          this.ws = ws
          this.bindWebSocketEvents()
        })

        ws.on('error', (err) => {
          logger.error('重连时发生错误:', err)
          ws?.close()
        })

        ws.on('close', () => {
          if (!this.isDisposing) {
            logger.info('WebSocket 再次断开，将继续尝试重连...')
          }
        })

      } catch (err) {
        logger.error('创建WebSocket时发生错误:', err)
        if (this.reconnectAttempts >= this.config.maxReconnectCount) {
          this.clearReconnectInterval()
        }
      }
    }, this.config.maxReconnectInterval)
  }

  private clearReconnectInterval() {
    if (this.reconnectIntervalId) {
      clearInterval(this.reconnectIntervalId)
      this.reconnectIntervalId = null
    }
    this.reconnectAttempts = 0
  }

  private setupMessageHandler() {
    this.ctx.on('message', async (session) => {
      if (!this.isValidChannel(session)) return

      if (this.isMessageCommand(session)) {
        await this.handleMessageCommand(session)
      }

      if (this.isRconCommand(session)) {
        await this.handleRconCommand(session)
      }
    })
  }

  private isValidChannel(session: any): boolean {
    return this.config.sendToChannel.includes(`${session.platform}:${session.channelId}`) || 
           session.platform === "sandbox"
  }

  private isMessageCommand(session: any): boolean {
    return session.content.startsWith(this.config.sendprefix) && 
           session.content !== this.config.sendprefix
  }

  private isRconCommand(session: any): boolean {
    return this.config.rconEnable && 
           this.config.cmdprefix && 
           session.content.startsWith(this.config.cmdprefix) && 
           session.content !== this.config.cmdprefix
  }

  private async handleMessageCommand(session: any) {
    let imgurl:any='<unknown image url>';
    if (session.content.includes('<img') && h.select(session.content, 'img')[0]?.type === 'img' && h.select(session.content, 'img')[0]?.attrs?.src) {
      imgurl = h.select(session.content, 'img')[0].attrs.src
    }

    let msg = session.content
      .replaceAll('&amp;', '&')
      .replaceAll(/<\/?template>/gi, '')
      .replace(this.config.sendprefix, '')
      .replaceAll(/<json.*\/>/gi, this.t('minecraft-sync-msg.message.jsonPlaceholder'))
      .replaceAll(/<video.*\/>/gi, this.t('minecraft-sync-msg.message.videoPlaceholder'))
      .replaceAll(/<audio.*\/>/gi, this.t('minecraft-sync-msg.message.audioPlaceholder'))
      .replaceAll(/<img.*\/>/gi, `[[CICode,url=${imgurl}]]`)
      .replaceAll(/<at.*\/>/gi,`@[${h.select(session.content, 'at')[0]?.attrs?.name? h.select(session.content, 'at')[0]?.attrs?.name:h.select(session.content, 'at')[0]?.attrs?.id}]`)

    try {
      const { output, color } = this.extractAndRemoveColor(msg)
      let username = session.username || session.author?.nickname || session.author?.card;
      if (!username) {
        try {
          const info = await session.bot.internal.getGroupMemberInfo(session.guildId!, session.userId);
          username = info.card || info.nickname || this.t('minecraft-sync-msg.message.unknownUser');
        } catch {
          username = this.t('minecraft-sync-msg.message.unknownUser');
        }
      }
      
      const msgData: WsMessageData = {
        "api": "broadcast",
        "data": {
          "message": [
            {
              "text": this.t('minecraft-sync-msg.message.MCReceivePrefix', [session.platform, username.card || username.nickname, session.userId]) + output,
              "color": color || "white"
            }
          ]
        }
      }
      this.ws?.send(JSON.stringify(msgData))
    } catch (err) {
      logger.error('[minecraft-sync-msg] 消息发送到WebSocket服务端失败', err)
    }
  }

  private async handleRconCommand(session: any) {
    const cmd = session.content
      .replaceAll('&amp;', '§')
      .replaceAll('&', '§')
      .replaceAll(this.config.cmdprefix, '')

    let response: string

    if (this.config.alluser) {
      response = await this.sendRconCommand(cmd)
    } else {
      if (this.config.superuser.includes(session.userId)) {
        response = cmd.includes(this.config.cannotCmd)
          ? this.t('minecraft-sync-msg.rcon.dangerousCmd')
          : await this.sendRconCommand(cmd)
        response = response || this.t('minecraft-sync-msg.rcon.noFeedback')
      } else if (cmd.includes(this.config.commonCmd)) {
        response = this.config.cannotCmd.includes(cmd)
          ? this.t('minecraft-sync-msg.rcon.dangerousCmd')
          : await this.sendRconCommand(cmd)
        response = response || this.t('minecraft-sync-msg.rcon.noFeedback')
      } else {
        response = this.t('minecraft-sync-msg.rcon.noPermission')
      }
    }

    session.send(response?.replaceAll(/§./g, '') || '')
  }

  private async sendRconCommand(command: string): Promise<string> {
    try {
      const response = await this.rcon.send(command)
      return response
    } catch (err) {
      logger.error('发送RCON命令时发生错误:', err)
      throw err
    }
  }

  private extractAndRemoveColor(input: string): MessageColor {
    const regex = /&(\w+)&/
    const match = input.match(regex)

    if (match) {
      const color = match[1]
      const output = input.replace(regex, '')
      return { output, color }
    }

    return { output: input, color: '' }
  }

  private broadcastToChannels(message: string|Fragment) {
    this.ctx.bots.forEach((bot: Bot) => {
      const channels = this.config.sendToChannel
        .filter(str => str.includes(`${bot.platform}`))
        .map(str => str.replace(`${bot.platform}:`, ''))
      bot.broadcast(channels, message, 0)
    })
  }

  private setupDisposeHandler() {
    this.ctx.on('dispose', async () => {
      this.ctx.registry.delete(mcWss);
      this.ctx.registry.delete(MinecraftSyncMsg);
      // 关掉之前的ws连接避免消息重复发送
      await new Promise(() => {
        this.ws?.close();
        this.ws?.removeAllListeners();
        this.ws? this.clearReconnectInterval():undefined;
      }) 
      this.ws = null;
      this.isDisposing = true;
    })
    this.isDisposing = false;
  }
}

namespace MinecraftSyncMsg {
  export interface Config extends wsConf, rconConf {
    sendToChannel: string[]
    sendprefix: string
    cmdprefix: string
    hideConnect: boolean
    locale: string
  }

  export const Config: Schema<Config> = Schema.intersect([
    wsConf,
    rconConf,
    Schema.object({
      sendToChannel: Schema.array(String)
        .description('消息发送到目标群组格式{platform}:{groupId}'),
      sendprefix: Schema.string().default('.#')
        .description("消息发送前缀（不可与命令发送前缀相同,可以为空）"),
      cmdprefix: Schema.string().default('./')
        .description("命令发送前缀（不可与消息发送前缀相同）"),
      hideConnect: Schema.boolean().default(true).description('关闭连接成功/失败提示'),
      locale: Schema.union(['zh-CN','en-US']).default('zh-CN')
        .description('本地化语言选择,zh_CN为中文,en-US为英文')
    }).description("基础配置")
  ] as const)

  export const usage = `
  插件使用详情请看 [v2.x](https://blog.iin0.cn/views/myblog/mc/wskoishitomc.html)  
  *** 注意 ***  
  * 命令发送前缀(不能为空)和消息发送前缀(可以为空)不能相同
  * forge端不支持PlayerCommandPreprocessEvent事件
  * * 原版端仅支持聊天、加入、离开事件
  * sendToChannel的格式为{platform}:{groupId},如：\`discord:123456\`
  * v2.1.0-beta可以通过\`本地化\`自定义对应事件发送格式
    - action节点的{0}是玩家名称{1}是消息
    - message节点中的{0}是平台{1}是用户名
  `
}

export default MinecraftSyncMsg