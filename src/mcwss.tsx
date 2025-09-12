import { Context, Logger, Schema, h, Bot } from 'koishi'
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { getListeningEvent, getSubscribedEvents, wsConf } from './values'
import zhCN from './locale/zh-CN.yml'
import enUS from './locale/en-US.yml'

class mcWss {
    private conf: mcWss.Config;
    private logger = new Logger("Minecraft-sync-msg-Wss");
    private wss: WebSocketServer;
    private ctx: Context;
    private connectedClients: Set<WebSocket> = new Set();

    constructor(ctx: Context, cfg: mcWss.Config) {
        this.conf = cfg;
        this.ctx = ctx;
        
        ctx.on('ready', async () => {
            this.ctx.i18n.define('zh-CN', zhCN)
            this.ctx.i18n.define('en-US', enUS)
            this.wss = new WebSocketServer({ host: cfg.wsHost, port: cfg.wsPort });
            ctx.logger.info(`Websocket服务器已启动 ws://${cfg.wsHost}:${cfg.wsPort}`);
            
            // 设置 WebSocket 连接处理
            this.setupWebSocketHandlers();
        });

        // 设置消息处理（只需要一次）
        this.setupMessageHandler();
        
        ctx.on('dispose', async () => {
            if (this.wss) {
                this.wss.close();
            }
            this.connectedClients.clear();
        });
    }

    private setupWebSocketHandlers() {
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            let msgData = {
                "api": "send_msg",
                data: {
                    "message": {
                    type: "text",
                    data: {
                        text: extractAndRemoveColor(this.conf.joinMsg).output,
                        color: extractAndRemoveColor(this.conf.joinMsg).color? extractAndRemoveColor(this.conf.joinMsg).color : "gold"
                    }
                    }
                }
            }
            ws.send(JSON.stringify(msgData));
            this.ctx.logger.success('客户端连接成功!');

            const headers = req.headers;

            // 验证 Token
            if (!this.verifyHeaders(headers).valid) {
                this.ctx.logger.error('请求头验证失败!');
                if (!this.conf.hideConnect) this.ctx.bots.forEach(async (bot: Bot) => {
                    const channels = this.conf.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    bot.broadcast(channels, "Websocket请求头验证失败!", 0);
                });
                ws.close(1008, 'Invalid header!');
                return;
            }
            
            if (!this.conf.hideConnect) this.ctx.bots.forEach(async (bot: Bot) => {
                const channels = this.conf.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                if (!this.conf.hideConnect) bot.broadcast(channels, "Websocket客户端连接成功!", 0);
            });

            // 添加到连接的客户端集合
            this.connectedClients.add(ws);

            // 当收到客户端消息时触发
            ws.on('message', async (buffer)=> {
                this.ctx.logger.info(`收到来自客户端的消息: ${buffer.toString()}`);
                const data = JSON.parse(buffer.toString())
                let eventName = data.event_name? getListeningEvent(data.event_name):'';
                if (!getSubscribedEvents(this.conf.event).includes(eventName)) return

                // let sendMsg = getSubscribedEvents(this.conf.event).includes(eventName)? `[${data.server_name}](${eventTrans[eventName].name}) ${eventTrans[eventName].action? data.player?.nickname+' ':''}${(eventTrans[eventName].action? eventTrans[eventName].action+' ':'')}${data.message? data.message:''}`:''
                // let sendMsg:any = h.unescape(sendMsg).replaceAll('&amp;','&').replaceAll(/<\/?template>/gi,'').replaceAll(/§./g,'')
                let sendMsg:any = h.unescape(data.message ? data.message : '').replaceAll('&amp;','&').replaceAll(/<\/?template>/gi,'').replaceAll(/§./g,'')
                sendMsg = sendMsg.replaceAll(/<json.*\/>/gi,'<json消息>')
                const imageMatch = sendMsg.match(/(https?|file):\/\/.*\.(jpg|jpeg|webp|ico|gif|jfif|bmp|png)/gi)
                const sendImage = imageMatch?.[0]
                if (sendImage) {
                    sendMsg = sendMsg.replace(sendImage, `<img src="${sendImage}" />`)
                }

                sendMsg = this.ctx.i18n.render([this.conf.locale? this.conf.locale:'zh-CN'], [`minecraft-sync-msg.action.${eventName}`],[data.player?.nickname, sendMsg])

                if(data.server_name)
                  this.ctx.bots.forEach(async (bot: Bot) => {
                    const channels = this.conf.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    sendMsg? bot.broadcast(channels, sendMsg, 0):'';
                });
            })

            ws.on('error', (err) => {
                if (!this.conf.hideConnect) this.ctx.bots.forEach(async (bot: Bot) => {
                  const channels = this.conf.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                  bot.broadcast(channels, "与Websocket客户端断通信时发生错误!", 0);
                });
                this.ctx.logger.error('与Websocket客户端断通信时发生错误!'+err)
            });

            // 当客户端断开连接时触发
            ws.on('close', () => {
                this.connectedClients.delete(ws);
                if (!this.conf.hideConnect) this.ctx.bots.forEach(async (bot: Bot) => {
                    const channels = this.conf.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    bot.broadcast(channels, "与Websocket客户端断开连接!", 0);
                });
                this.ctx.logger.error('非正常与Websocket客户端断开连接!')
            });
        });
    }

    private setupMessageHandler() {
        let imgurl:any='<unknown image url>'
        this.ctx.on('message', async (session) => {
            // this.ctx.logger.info(`收到聊天消息: ${session.content} 来自 ${session.platform}:${session.channelId}`);
            if (session.content.includes('<img') && h.select(session.content, 'img')[0]?.type === 'img' && h.select(session.content, 'img')[0]?.attrs?.src) {
                imgurl = h.select(session.content, 'img')[0].attrs.src
            }

            if (this.conf.sendToChannel.includes(`${session.platform}:${session.channelId}`) || session.platform === "sandbox") {
                if ((session.content.startsWith(this.conf.sendprefix)) && session.content !== this.conf.sendprefix) {
                    let msg: string = session.content.replaceAll('&amp;', '&').replaceAll(/<\/?template>/gi, '').replace(this.conf.sendprefix, '')
                    .replaceAll(/<json.*\/>/gi,'<json消息>').replaceAll(/<video.*\/>/gi,'<视频消息>').replaceAll(/<audio.*\/>/gi,'<音频消息>').replaceAll(/<img.*\/>/gi, `[[CICode,url=${imgurl}]]`)
                    .replaceAll(/<at.*\/>/gi,`@[${h.select(session.content, 'at')[0]?.attrs?.name? h.select(session.content, 'at')[0]?.attrs?.name:h.select(session.content, 'at')[0]?.attrs?.id}]`)
                    if (this.connectedClients.size > 0) {
                        let msgData = {
                            "api": "send_msg",
                            data: {
                                "message": {
                                    type: "text",
                                    data: {
                                        // text: `(${session.platform})[${session.event.user.name}] ` + extractAndRemoveColor(msg).output,
                                        text: (this.ctx.i18n.render([this.conf.locale? this.conf.locale:'zh-CN'], ['minecraft-sync-msg.message.MCReceivePrefix'],[session.platform,session.userId])).map(element => element.attrs?.content).join('') + extractAndRemoveColor(msg).output,
                                        color: extractAndRemoveColor(msg).color ? extractAndRemoveColor(msg).color : "white"
                                    }
                                }
                            }
                        };
                        
                        let sent = false;
                        this.connectedClients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                try {
                                    client.send(JSON.stringify(msgData));
                                    sent = true;
                                } catch (err) {
                                    this.ctx.logger.error(`聊天消息发送到WebSocket客户端失败: ${err}`);
                                }
                            }
                        });
                        
                        if (!sent) {
                            session.send('发送失败! 没有可用的WebSocket连接。');
                        }
                    } else {
                        session.send('发送失败! 没有可用的WebSocket连接。');
                    }
                }
            }
            
        });
    }

    verifyHeaders(headers: IncomingMessage['headers']): { valid: boolean, clientOrigin?: string } {
        const authHeader = headers['authorization'];
        const selfNameHeader = headers['x-self-name'];
        const clientOriginHeader = headers['x-client-origin'];
        // 验证 Token
        if (!authHeader) {
            this.logger.error('Missing authorization header');
            return { valid: false };
        }
        const token = authHeader.split(' ')[1];
        if (token !== this.conf.Token) {
            this.logger.error("Token is invalid!");
            return { valid: false };
        }
        // 验证 x-self-name
        if (!selfNameHeader) {
            this.logger.error('Missing x-self-name header');
            return { valid: false };
        }
        if (selfNameHeader !== this.conf.serverName) {
            this.logger.error('Invalid x-self-name');
            return { valid: false };
        }
        // 获取 x-client-origin
        const clientOrigin = clientOriginHeader as string | undefined;    
        return { valid: true, clientOrigin };
    }
}

export function extractAndRemoveColor(input: string): { output: string, color: string } {
    const regex = /&(\w+)&/;
    const match = input.match(regex);
  
    if (match) {
      const color = match[1];
      const output = input.replace(regex, '');
      return { output, color };
    }
  
    return { output: input, color: '' };
}

namespace mcWss {
    export interface Config extends wsConf {
        sendToChannel: string[],
        sendprefix: string,
        hideConnect: boolean,
        locale: string | any
    }

    export const Config: Schema<Config> = Schema.intersect([
        wsConf,
        Schema.object({
          sendToChannel: Schema.array(String)
          .description('消息发送到目标群组格式{paltform}:{groupId}'),
          sendprefix: Schema.string().default('.#')
          .description("消息发送前缀（不可与命令发送前缀相同）"),
          hideConnect: Schema.boolean().default(true).description('关闭连接成功/失败提示'),
          locale: Schema.union(['zh-CN','en-US']).default('zh-CN')
          .description('本地化语言选择,zh_CN为中文,en-US为英文')
        }).description("基础配置")
    ] as const)
}

export default mcWss