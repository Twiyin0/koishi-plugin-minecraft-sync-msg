import { Context, Logger, Schema, h, Bot } from 'koishi'
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { getListeningEvent, getSubscribedEvents, eventTrans, wsConf } from './values'
import { extractAndRemoveColor, name } from './index'

class mcWss {
    private conf: mcWss.Config;
    private logger = new Logger(name);
    constructor(ctx: Context, cfg: mcWss.Config) {
        this.conf = cfg;
        let wss:WebSocketServer;
        ctx.on('ready', async () => {
            wss = new WebSocketServer({ host: cfg.wsHost, port: cfg.wsPort });
            ctx.logger.info(`Websocket服务器已启动 ws://${cfg.wsHost}:${cfg.wsPort}`);
        })

        ctx.on('dispose', async () => {
            wss.close();
        })

        // 当有新的 WebSocket 连接时触发
        wss?.on('connection', (ws: WebSocket, req: IncomingMessage) => {

            let msgData = {
                "api": "send_msg",
                data: {
                    "message": {
                    type: "text",
                    data: {
                        text: extractAndRemoveColor(cfg.joinMsg).output,
                        color: extractAndRemoveColor(cfg.joinMsg).color? extractAndRemoveColor(cfg.joinMsg).color : "gold"
                    }
                    }
                }
            }
            ws.send(JSON.stringify(msgData));
            ctx.logger.success('客户端连接成功!');

            const headers = req.headers;

            // 验证 Token
            if (!this.verifyHeaders(headers).valid) {
                ctx.logger.error('请求头验证失败!');
                if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
                    const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    bot.broadcast(channels, "Websocket请求头验证失败!", 0);
                });
                ws.close(1008, 'Invalid header!');
                return;
            }
            if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
                const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                bot.broadcast(channels, "Websocket客户端连接成功!", 0);
            });

            // 当收到客户端消息时触发
            ws.on('message', async (buffer)=> {
                const data = JSON.parse(buffer.toString())
                let eventName = data.event_name? getListeningEvent(data.event_name):'';
                let sendMsg = getSubscribedEvents(cfg.event).includes(eventName)? `[${data.server_name}](${eventTrans[eventName].name}) ${eventTrans[eventName].action? data.player?.nickname+' ':''}${(eventTrans[eventName].action? eventTrans[eventName].action+' ':'')}${data.message? data.message:''}`:''
                sendMsg = h.unescape(sendMsg).replaceAll('&amp;','&').replaceAll(/<\/?template>/gi,'').replaceAll(/§./g,'')
                if(data.server_name)
                  ctx.bots.forEach(async (bot: Bot) => {
                    const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    sendMsg? bot.broadcast(channels, sendMsg, 0):'';
                });
            })

            ws.on('error', function error(err) {
                if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
                  const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                  bot.broadcast(channels, "与Websocket客户端断通信时发生错误!", 0);
                });
                ctx.logger.error('与Websocket客户端断通信时发生错误!'+err)
            });

            // 当客户端断开连接时触发
            ws.on('close', () => {
                if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
                    const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
                    bot.broadcast(channels, "与Websocket客户端断开连接!", 0);
                });
                ctx.logger.error('非正常与Websocket客户端断开连接!')
            });

            ctx.on('message', async (session) => {
                if (cfg.sendToChannel.includes(`${session.platform}:${session.channelId}`) || session.platform=="sandbox") {
                  if ((session.content.startsWith(cfg.sendprefix)) && session.content != cfg.sendprefix) {
                    let msg:string = session.content.replaceAll('&amp;', '&').replaceAll(/<\/?template>/gi,'').replaceAll(cfg.sendprefix,'');
                    try {
                        let msgData = {
                            "api": "send_msg",
                            data: {
                            "message": {
                                type: "text",
                                data: {
                                text: `(${session.platform})[${session.event.user.name}] `+extractAndRemoveColor(msg).output,
                                color: extractAndRemoveColor(msg).color? extractAndRemoveColor(msg).color : "white"
                                }
                            }
                            }
                        }
                        // 发送消息示例
                        ws?.send(JSON.stringify(msgData));
                        } catch (err) {
                            session.send('发送失败!');
                            ctx.logger.error(`聊天消息发送到WebSocket客户端失败`);
                        }
                    }
                }
            })
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

namespace mcWss {
    export interface Config extends wsConf {
        sendToChannel: string[],
        sendprefix: string,
        hideConnect: boolean
    }

    export const Config: Schema<Config> = Schema.intersect([
        wsConf,
        Schema.object({
          sendToChannel: Schema.array(String)
          .description('消息发送到目标群组'),
          sendprefix: Schema.string().default('.#')
          .description("消息发送前缀（不可与命令发送前缀相同）"),
          hideConnect: Schema.boolean().default(true).description('关闭连接成功/失败提示')
        }).description("基础配置")
    ] as const)
}

export default mcWss
