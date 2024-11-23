import { Context, Schema, Logger, h, Bot } from 'koishi'
import { WebSocket } from 'ws'
import { Rcon } from 'rcon-client'
import { getListeningEvent, getSubscribedEvents, eventTrans, wsConf, rconConf } from './values'

export const name = 'minecraft-sync-msg'

export const usage = `
插件使用详情请看 [v2.x](https://twiyin0.github.io/blogs/myblog/mc/wskoishitomc.html)  
*** 注意 ***  
* 命令发送前缀(不能为空)和消息发送前缀(可以为空)不能相同  
* forge端不支持PlayerCommandPreprocessEvent事件
`

const logger = new Logger(name);

export interface Config extends wsConf, rconConf {
  sendToChannel: string[],
  sendprefix: string,
  cmdprefix: string,
  hideConnect: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  wsConf,
  rconConf,
  Schema.object({
    sendToChannel: Schema.array(String)
    .description('消息发送到目标群组'),
    sendprefix: Schema.string().default('.#')
    .description("消息发送前缀（不可与命令发送前缀相同）"),
    cmdprefix: Schema.string().default('./')
    .description("命令发送前缀（不可与消息发送前缀相同）"),
    hideConnect: Schema.boolean().default(true).description('关闭连接成功/失败提示')
  }).description("基础配置")
] as const)

export async function apply(ctx: Context, cfg: Config) {
  const rcon = new Rcon({
    host: cfg.rconServerHost,
    port: cfg.rconServerPort,
    password: cfg.rconPassword,
  });

  const headers = {
    "x-self-name": cfg.serverName,
    "Authorization": `Bearer ${cfg.Token}`,
    "x-client-origin": "koishi"
  };

  const ws = new WebSocket(`ws://${cfg.wsHost}:${cfg.wsPort}/minecraft/ws`, {
    headers: headers
  });

  ctx.on('dispose', () => {
    ws.close();
    logger.success('正常与websocket服务器断开连接!');
  })

  ws.on('open', function open() {
    logger.info('成功连上websocket服务器');
    if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
      const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
      bot.broadcast(channels, "Websocket服务器连接成功!", 0);
    });
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
    // 发送消息示例
    ws.send(JSON.stringify(msgData));
  });

  ws.on('message', async (buffer)=> {
    const data = JSON.parse(buffer.toString())
    let eventName = getListeningEvent(data.event_name)
    let sendMsg = getSubscribedEvents(cfg.event).includes(eventName)? `[${data.server_name}](${eventTrans[eventName].name}) ${eventTrans[eventName].action? data.player?.nickname+' ':''}${(eventTrans[eventName].action? eventTrans[eventName].action+' ':'')}${data.message? data.message:''}`:''
    sendMsg = h.unescape(sendMsg).replaceAll('&amp;','&').replaceAll(/<\/?template>/gi,'').replaceAll(/§./g,'')
    if(data.server_name)
      ctx.bots.forEach(async (bot: Bot) => {
        const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
        sendMsg? bot.broadcast(channels, sendMsg, 0):'';
      });
  })

  // 连接关闭时的回调
  ws.on('close', function close() {
    if (!cfg.hideConnect) ctx.bots.forEach(async (bot: Bot) => {
      const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
      bot.broadcast(channels, "与Websocket服务器断开连接!", 0);
    });
    logger.error('非正常与Websocket服务器断开连接!')
  });

  // 连接错误时的回调
  ws.on('error', function error(err) {
    ctx.bots.forEach(async (bot: Bot) => {
      const channels = cfg.sendToChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
      bot.broadcast(channels, "与Websocket服务器断通信时发生错误!", 0);
    });
    logger.error('与Websocket服务器断通信时发生错误!'+err)
  });

  if (cfg.rconEnable) {
    try {
      await connectToRcon(rcon);
    } catch(err) {
      logger.error('RCON服务器连接失败');
    }
  }

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
        ws.send(JSON.stringify(msgData));
      } catch (err) { logger.error(`[minecraft-sync-msg] 消息发送到WebSocket服务端失败`) }
    }

    if ((session.content.startsWith(cfg.cmdprefix)) && session.content != cfg.cmdprefix && cfg.rconEnable && cfg.cmdprefix) {
      var cmd:string = session.content.replaceAll('&amp;','§').replaceAll('&','§').replaceAll(cfg.cmdprefix,'');
      if (cfg.alluser) var res = await sendRconCommand(rcon,cmd);
      else {
        if (cfg.superuser.includes(session.userId)) {
          var res = cfg.cannotCmd.includes(cmd)? '危险命令，禁止使用' : await sendRconCommand(rcon,cmd);
          res = res? res:'该命令无反馈'
        }
        else if (cfg.commonCmd.includes(cmd)) {
          var res = cfg.cannotCmd.includes(cmd)? '危险命令，禁止使用' : await sendRconCommand(rcon,cmd);
          res = res? res:'该命令无反馈'
        }
        else var callbk = '无权使用该命令'
      }
      session.send(res? res.replaceAll(/§./g, '') : callbk);
    }
  }
  })
}

// RCON部分
async function connectToRcon(rcon: any) {
  try {
    await rcon.connect();
    logger.info('已连接到RCON服务器');
  } catch (err) {
    logger.error('连接到RCON服务器时发生错误：', err);
  }
}

async function sendRconCommand(rcon:any, command:String) {
  try {
    const response = await rcon.send(command);
    return response;
  } catch (err) {
    logger.error('发送RCON命令时发生错误：', err);
  }
}

// 其他功能函数
function extractAndRemoveColor(input: string): { output: string, color: string } {
  const regex = /&(\w+)&/;
  const match = input.match(regex);

  if (match) {
      const color = match[1];
      const output = input.replace(regex, '');
      return { output, color };
  }

  return { output: input, color: '' };
}
