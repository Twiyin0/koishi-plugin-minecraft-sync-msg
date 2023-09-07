import { Context, Schema, Logger, h } from 'koishi'

const iconv = require('iconv-lite');
const net = require('net');
const Rcon = require('rcon-client').Rcon;

export const name = 'minecraft-sync-msg'

export const usage = `
使用详情查看 [音铃的博客](https://blog.iin0.cn/views/myblog/mc/koishiandmc.html)
`

const logger = new Logger(name);

export interface socketConf {
  socketServerHost: String,
  socketServerPort: String
}

export const socketConf = Schema.object({
  socketServerHost: Schema.string().default('127.0.0.1')
  .description("socket服务器的地址"),
  socketServerPort: Schema.string().default('21354')
  .description("socket服务器的端口(必填)"),
})

export interface rconConf {
  rconServerHost: String,
  rconServerPort: String,
  rconPassword: String,
  alluser: boolean,
  superuser: string[],
  commonCmd: string[],
  cannotCmd: string[],
}

export const rconConf = Schema.object({
  rconServerHost: Schema.string().default('127.0.0.1')
  .description('rcon服务器地址'),
  rconServerPort: Schema.string().default('25575')
  .description('rcon服务器地址端口'),
  rconPassword: Schema.string()
  .description('rcon服务器的密码(推荐设置)'),
  alluser: Schema.boolean().default(false)
  .description('所有用户可用(开启后下面的配置失效)'),
  superuser: Schema.array(String)
  .description('超级用户的ID，可以使用RCON所有命令'),
  commonCmd: Schema.array(String).default(['list','tps'])
  .description('普通用户可以使用的命令'),
  cannotCmd: Schema.array(String).default(['restart','stop'])
})

export interface Config {
  socket: socketConf,
  RCON: rconConf,
  sendToChannel: string[],
}

export const Config = Schema.object({
  socket: socketConf,
  RCON: rconConf,
  sendToChannel: Schema.array(String)
  .description('消息发送到目标群组')
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
  const client = net.createConnection(cfg.socket.socketServerPort, cfg.socket.socketServerHost);
  let sendChannel = cfg.sendToChannel;// ['onebot:737352767'];
  // 监听连接建立事件
  client.on('connect', () => {
    // 发送数据到服务端
    client.write("§6客户端已连接!\n");
    ctx.emit('minecraft-sync-msg/socket-connected', true);
  });

  // 监听从服务端接收到的数据
  client.on('data', (data) => {
    const gbkmsg = iconv.decode(data, 'gbk'); // 使用iconv-lite将数据从GBK编码解码为字符串
    // 处理接收到的数据，可以触发自定义事件
    ctx.emit('minecraft-sync-msg/socket-getdata', gbkmsg);
  });

  // 监听连接关闭事件
  client.on('close', () => {
    ctx.emit('minecraft-sync-msg/socket-disconnect', true)
  });

  // 监听连接错误事件
  client.on('error', (err) => {
    ctx.emit('minecraft-sync-msg/socket-error', true)
    logger.error('Socket连接错误:', err);
  });


  ctx.on('minecraft-sync-msg/socket-connected', (connected)=>{
    if (connected)
      logger.success(`socket已连接至${cfg.socket.socketServerHost}:${cfg.socket.socketServerPort}`);
  })

  ctx.on('minecraft-sync-msg/socket-getdata', (data)=> {
    if (data) {
      data = data.replace('[聊天信息]>> ','');
      var msg = (data.match(/<at id=(.*)\/>/gi) || data.match(/<image url=(.*)\/>/gi))?
        h.unescape(data):data;
      ctx.broadcast(sendChannel,msg,false)
      logger.info('收到socket服务端消息<< '+data)
    }
  })

  ctx.on('minecraft-sync-msg/socket-disconnect',(disconnect)=>{
    if (disconnect) 
      ctx.broadcast(sendChannel,'Socket断开连接！',false)
  })

  ctx.on('minecraft-sync-msg/socket-disconnect',(err)=>{
    if (err) 
      ctx.broadcast(sendChannel,'Socket连接失败,请重启插件!',false)
  })

  try {
    await connectToRcon(rcon);
  } catch(err) {
    logger.error('RCON服务器连接失败');
  }

  ctx.on('message', async (session)=>{
    if ((session.content.startsWith('.#') || session.content.startsWith('。#')) && session.content != '.#' &&  session.content != '。#') {
      var msg:String = session.content.replace('&amp;','§').replace('&','§').replace('.#','').replace('。#','');
      client.write(`[${session.username}] ${msg}`)
    }

    if ((session.content.startsWith('#/')) && session.content != '#/') {
      var cmd:string = session.content.replace('&amp;','§').replace('&','§').replace('#/','');
      if (cfg.RCON.alluser) var res = await sendRconCommand(rcon,cmd);
      else {
        if (cfg.RCON.superuser.includes(session.userId) && cfg.RCON.cannotCmd.includes(cmd))
          var res = await sendRconCommand(rcon,cmd);
        else if (cfg.RCON.commonCmd.includes(cmd))
          var res = await sendRconCommand(rcon,cmd);
        else session.send('无权使用该命令')
      }
      session.send(res.replace(/§./g, ''));
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
