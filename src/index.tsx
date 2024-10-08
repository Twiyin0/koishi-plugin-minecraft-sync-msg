import { Context, Schema, Logger, h, Bot } from 'koishi'

const iconv = require('iconv-lite');
const net = require('net');
const Rcon = require('rcon-client').Rcon;

export const name = 'minecraft-sync-msg'

export const usage = `
使用详情查看 [音铃的博客](https://blog.iin0.cn/views/myblog/mc/koishiandmc.html)  
*** 注意 ***  
命令发送前缀和消息发送前缀不能相同
`

const logger = new Logger(name);

export interface socketConf {
  socketEnabled: Boolean,
  socketServerHost: String,
  socketServerPort: String
  socketServerToken: String,
}

export const socketConf = Schema.object({
  socketEnabled: Schema.boolean().default(true)
  .description("是否启用socket(不启用就不接收消息)"),
  socketServerHost: Schema.string().default('127.0.0.1')
  .description("socket服务器的地址"),
  socketServerPort: Schema.string().default('21354')
  .description("socket服务器的端口"),
  socketServerToken: Schema.string().default('Token12345')
  .description("socket服务器的验证Token"),
})

export interface rconConf {
  rconEnable: boolean,
  rconServerHost: String,
  rconServerPort: String,
  rconPassword: String,
  alluser: boolean,
  superuser: string[],
  commonCmd: string[],
  cannotCmd: string[],
}

export const rconConf = Schema.object({
  rconEnable: Schema.boolean().default(true)
  .description('开启RCON功能'),
  rconServerHost: Schema.string().default('127.0.0.1')
  .description('rcon服务器地址'),
  rconServerPort: Schema.string().default('25575')
  .description('rcon服务器地址端口'),
  rconPassword: Schema.string().role('secret')
  .description('rcon服务器的密码(推荐设置)'),
  alluser: Schema.boolean().default(false)
  .description('所有用户可用(开启后下面的配置失效)'),
  superuser: Schema.array(String)
  .description('超级用户的ID，可以使用RCON所有命令'),
  commonCmd: Schema.array(String).default(['list','spigot:tps'])
  .description('普通用户可以使用的命令'),
  cannotCmd: Schema.array(String).default(['restart','stop'])
})

export interface Config {
  socket: socketConf,
  RCON: rconConf,
  sendToChannel: string[],
  chatOnly: boolean,
  toGBK: boolean,
  debugger: boolean,
  sendprefix: string,
  cmdprefix: string,
}

export const Config = Schema.object({
  socket: socketConf,
  RCON: rconConf,
  sendToChannel: Schema.array(String)
  .description('消息发送到目标群组'),
  chatOnly: Schema.boolean().default(false)
  .description('仅接收聊天消息'),
  toGBK: Schema.boolean().default(false)
  .description("接收消息转为gbk"),
  debugger: Schema.boolean().default(false)
  .description('打开调试模式，查看发送的群组信息是否正确'),
  sendprefix: Schema.string().default('.#')
  .description("消息发送前缀（不可与命令发送前缀相同）"),
  cmdprefix: Schema.string().default('./')
  .description("命令发送前缀（不可与消息发送前缀相同）"),
})

declare module 'koishi' {
  interface Events {
    'minecraft-sync-msg/socket-connected'(...args: any[]): void,
    'minecraft-sync-msg/socket-getdata'(...args: any[]): void,
    'minecraft-sync-msg/socket-disconnect'(...args: any[]): void,
    'minecraft-sync-msg/socket-error'(...args: any[]): void,
  }
}

export async function apply(ctx: Context, cfg: Config) {
  const rcon = new Rcon({
    host: cfg.RCON.rconServerHost,
    port: cfg.RCON.rconServerPort,
    password: cfg.RCON.rconPassword,
  });
  const client = cfg.socket.socketEnabled? net.createConnection(cfg.socket.socketServerPort, cfg.socket.socketServerHost):'';
  let sendChannel = cfg.sendToChannel
  // 监听连接建立事件
  client.on('connect', () => {
    // 发送数据到服务端
    if(cfg.socket.socketServerToken && cfg.socket.socketEnabled) client.write(`${cfg.socket.socketServerToken}\n`);
    client.write("§6客户端已连接!\n");
    ctx.emit('minecraft-sync-msg/socket-connected', true);
  });

  // 监听从服务端接收到的数据
  client.on('data', (data) => {
    const decodemsg = cfg.toGBK? iconv.decode(data, 'gbk'): data.toString('utf-8');
    // 处理接收到的数据，可以触发自定义事件
    ctx.emit('minecraft-sync-msg/socket-getdata', decodemsg);
  });

  // 监听连接关闭事件
  client.on('close', () => {
    ctx.emit('minecraft-sync-msg/socket-disconnect', true)
  });

  // 监听连接错误事件
  client.on('error', (err) => {
    logger.error('Socket连接错误:', err);
    if (err.code === 'ECONNREFUSED') {
      logger.error('Socket连接被服务器拒绝');
    }
    ctx.emit('minecraft-sync-msg/socket-error', true)
  });

  ctx.on('dispose', () => {
    client.end();
    logger.success('socket断开连接!');
  })

  ctx.on('minecraft-sync-msg/socket-connected', (connected)=>{
    if (connected)
      logger.success(`socket已连接至${cfg.socket.socketServerHost}:${cfg.socket.socketServerPort}`);
  })

  ctx.on('minecraft-sync-msg/socket-getdata',async (data)=> {
    if (data && (cfg.chatOnly? data.startsWith("[聊天信息]>>"):true)) {
      data = data.replace('[聊天信息]>> ','').replaceAll(/§./g,'');
      var msg = (data.match(/<at id=(.*)\/>/gi) || data.match(/<image url=(.*)\/>/gi))?
        h.unescape(data):data;
      logger.info('收到socket服务端消息<< '+data);
      console.log(`${sendChannel}`)
      ctx.bots.forEach(async (bot: Bot) => {
        const channels = sendChannel.filter(str => str.includes(`${bot.platform}`)).map(str => str.replace(`${bot.platform}:`, ''));
        cfg.debugger? logger.debug(`发送平台${bot.platform}>>发送群组${channels}>>配置群组${cfg.sendToChannel}`):'';
        bot.broadcast(channels, msg, 0);
      });
    }
  })

  ctx.on('minecraft-sync-msg/socket-disconnect',(disconnect)=>{
    if (disconnect) 
      ctx.broadcast(sendChannel,'Socket断开连接！')
  })

  ctx.on('minecraft-sync-msg/socket-error',(err)=>{
    if (err) 
      ctx.broadcast(sendChannel,'Socket连接失败,请重启插件!')
  })

  if (cfg.RCON.rconEnable) {
    try {
      await connectToRcon(rcon);
    } catch(err) {
      logger.error('RCON服务器连接失败');
    }
  }

  ctx.on('message', async (session) => {
  if (cfg.sendToChannel.includes(`${session.platform}:${session.channelId}`) || session.platform=="sandbox") {
    var passbyCmd:String[] = ["tps","TPS","服务器信息","server_info"];
    if (passbyCmd.includes(session.content) && cfg.socket.socketEnabled) client.write(`${session.content}\n`);
    if ((session.content.startsWith(cfg.sendprefix)) && session.content != cfg.sendprefix && cfg.socket.socketEnabled) {
      var msg:String = session.content.replaceAll('&amp;','§').replaceAll('&','§').replaceAll(cfg.sendprefix,'');
      try {
        client.write(`[${session.username}] ${msg} \n`);
        logger.info(`[minecraft-sync-msg] 已将消息发送至Socket服务端`);
      } catch (err) { logger.error(`[minecraft-sync-msg] 消息发送到Socket服务端失败`) }
    }

    if ((session.content.startsWith(cfg.cmdprefix)) && session.content != cfg.cmdprefix && cfg.RCON.rconEnable) {
      var cmd:string = session.content.replaceAll('&amp;','§').replaceAll('&','§').replaceAll(cfg.cmdprefix,'');
      if (cfg.RCON.alluser) var res = await sendRconCommand(rcon,cmd);
      else {
        if (cfg.RCON.superuser.includes(session.userId)) {
          var res = cfg.RCON.cannotCmd.includes(cmd)? '危险命令，禁止使用' : await sendRconCommand(rcon,cmd);
          res = res? res:'该命令无反馈'
        }
        else if (cfg.RCON.commonCmd.includes(cmd)) {
          var res = cfg.RCON.cannotCmd.includes(cmd)? '危险命令，禁止使用' : await sendRconCommand(rcon,cmd);
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
