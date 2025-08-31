import { Context, Schema, Logger, h, Bot } from 'koishi'
import { WebSocket, RawData } from 'ws'
import { Rcon } from 'rcon-client'
import { getListeningEvent, getSubscribedEvents, eventTrans, wsConf, rconConf } from './values'
import mcWss from './mcwss'

export const name = 'mcmsg'

const logger = new Logger('minecraft-sync-msg')

interface MessageColor {
  output: string
  color: string
}

interface WsMessageData {
  api: string
  data: {
    message: {
      type: string
      data: {
        text: string
        color?: string
      }
    }
  }
}

class MinecraftSyncMsg {
  private ws: WebSocket | undefined
  private rcon: Rcon
  private isDisposing = false
  private reconnectAttempts = 0
  private reconnectIntervalId: NodeJS.Timeout | null = null
  private pl_fork: any

  constructor(private ctx: Context, private config: MinecraftSyncMsg.Config) {
    this.initialize()
  }

  private initialize() {
    this.setupRcon()
    this.setupWebSocket()
    this.setupMessageHandler()
    this.setupDisposeHandler()
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
      // this.pl_fork = new mcWss(this.ctx, this.config);
      return;
    }
    else
      this.connectWebSocket()
  }

  private connectWebSocket() {
    const headers = {
      "x-self-name": this.config.serverName,
      "Authorization": `Bearer ${this.config.Token}`,
      "x-client-origin": "koishi"
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
    logger.info('成功连上websocket服务器')
    
    if (!this.config.hideConnect) {
      this.broadcastToChannels("Websocket服务器连接成功!")
    }

    const msgData: WsMessageData = {
      "api": "send_msg",
      data: {
        "message": {
          type: "text",
          data: {
            text: this.extractAndRemoveColor(this.config.joinMsg).output,
            color: this.extractAndRemoveColor(this.config.joinMsg).color || "gold"
          }
        }
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
    
    if (!getSubscribedEvents(this.config.event).includes(eventName)) return
  
    let sendMsg = `[${data.server_name}](${eventTrans[eventName].name}) ${
      eventTrans[eventName].action ? data.player?.nickname + ' ' : ''
    }${
      eventTrans[eventName].action ? eventTrans[eventName].action + ' ' : ''
    }${
      data.message ? data.message : ''
    }`
  
    sendMsg = h.unescape(sendMsg)
      .replaceAll('&amp;', '&')
      .replaceAll(/<\/?template>/gi, '')
      .replaceAll(/§./g, '')
    sendMsg = sendMsg.replaceAll(/<json.*\/>/gi,'<json消息>').replaceAll(/<video.*\/>/gi,'<视频消息>').replaceAll(/<audio.*\/>/gi,'<音频消息>')
  
    const imageMatch = sendMsg.match(/(https?|file):\/\/.*\.(jpg|jpeg|webp|ico|gif|jfif|bmp|png)/gi)
    const sendImage = imageMatch?.[0]
  
    if (sendImage) {
      sendMsg = sendMsg.replace(sendImage, `<img src="${sendImage}" />`)
    }
  
    if (data.server_name && sendMsg) {
      this.broadcastToChannels(sendMsg)
    }
  }

  private handleWsClose() {
    if (this.isDisposing) return

    if (!this.config.hideConnect) {
      this.broadcastToChannels("与Websocket服务器断开连接!")
    }

    logger.error('非正常与Websocket服务器断开连接!')
    this.ws = undefined
    this.reconnectWebSocket()
  }

  private handleWsError(err: Error) {
    if (this.isDisposing) return

    if (!this.config.hideConnect) {
      this.broadcastToChannels("与Websocket服务器断通信时发生错误!")
    }

    logger.error('与Websocket服务器断通信时发生错误:', err)
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
          ws.close()
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
    let imgurl: string
    if (session.content.includes('<img')) {
      imgurl = h.select(session.content, 'img')[0].attrs.src
    }

    let msg = session.content
      .replaceAll('&amp;', '&')
      .replaceAll(/<\/?template>/gi, '')
      .replace(this.config.sendprefix, '')
      .replaceAll(/<json.*\/>/gi,'<json消息>').replaceAll(/<video.*\/>/gi,'<视频消息>').replaceAll(/<audio.*\/>/gi,'<音频消息>')
      .replaceAll(/<img.*\/>/gi, `[[CICode,url=${imgurl}]]`)
      .replaceAll(/<at.*\/>/gi,`@[${h.select(session.content, 'at')[0].attrs.name? h.select(session.content, 'at')[0].attrs.name:h.select(session.content, 'at')[0].attrs.id}]`)

    try {
      const { output, color } = this.extractAndRemoveColor(msg)
      const msgData: WsMessageData = {
        "api": "send_msg",
        data: {
          "message": {
            type: "text",
            data: {
              text: `(${session.platform})[${session.event.user.name}] ` + output,
              color: color || "white"
            }
          }
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
          ? '危险命令，禁止使用' 
          : await this.sendRconCommand(cmd)
        response = response || '该命令无反馈'
      } else if (cmd.includes(this.config.commonCmd)) {
        response = this.config.cannotCmd.includes(cmd) 
          ? '危险命令，禁止使用' 
          : await this.sendRconCommand(cmd)
        response = response || '该命令无反馈'
      } else {
        response = '无权使用该命令'
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

  private broadcastToChannels(message: string) {
    this.ctx.bots.forEach((bot: Bot) => {
      const channels = this.config.sendToChannel
        .filter(str => str.includes(`${bot.platform}`))
        .map(str => str.replace(`${bot.platform}:`, ''))
      bot.broadcast(channels, message, 0)
    })
  }

  private setupDisposeHandler() {
    this.ctx.on('dispose', async () => {
      this.isDisposing = true
      await this.dispose()
      this.isDisposing = false
    })
  }

  private async dispose() {
    await this.pl_fork.dispose();
    this.ctx.registry.delete(mcWss)

    if (this.ws) {
      this.ws.removeAllListeners()
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close()
      }
      this.ws = undefined
    }

    this.clearReconnectInterval()
  }
}



namespace MinecraftSyncMsg {
  export interface Config extends wsConf, rconConf {
    sendToChannel: string[]
    sendprefix: string
    cmdprefix: string
    hideConnect: boolean
  }

  export const Config: Schema<Config> = Schema.intersect([
    wsConf,
    rconConf,
    Schema.object({
      sendToChannel: Schema.array(String)
        .description('消息发送到目标群组'),
      sendprefix: Schema.string().default('.#')
        .description("消息发送前缀（不可与命令发送前缀相同,可以为空）"),
      cmdprefix: Schema.string().default('./')
        .description("命令发送前缀（不可与消息发送前缀相同）"),
      hideConnect: Schema.boolean().default(true).description('关闭连接成功/失败提示')
    }).description("基础配置")
  ] as const)

  export const usage = `
  插件使用详情请看 [v2.x](https://blog.iin0.cn/views/myblog/mc/wskoishitomc.html)  
  *** 注意 ***  
  * 命令发送前缀(不能为空)和消息发送前缀(可以为空)不能相同
  * forge端不支持PlayerCommandPreprocessEvent事件
  * * 原版端仅支持聊天、加入、离开事件
  `
}

export default MinecraftSyncMsg