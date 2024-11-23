import { Schema } from 'koishi'

// 放在主逻辑里面很碍眼的东西
export enum mcEvent {
    // spigot
    AsyncPlayerChatEvent = 1,
    PlayerCommandPreprocessEvent = 1 * 10,
    PlayerDeathEvent = 1 * 100,
    PlayerJoinEvent = 1 * 1000,
    PlayerQuitEvent = 1 * 10000,
}

export interface wsConf {
    wsHost: string,
    wsPort: string | number,
    Token: string,
    serverName: string,
    joinMsg: string,
    event: mcEvent,
}
  
export const wsConf = Schema.object({
    wsHost: Schema.string().default('127.0.0.1')
    .description("websocket服务器的地址"),
    wsPort: Schema.string().default('8080')
    .description("websocket服务器的端口"),
    Token: Schema.string()
    .description("websocket服务器的验证Token"),
    serverName: Schema.string()
    .description("鹊桥配置文件中对应的server_name"),
    joinMsg: Schema.string().default("[客户端] 连接成功！").description('连接服务的成功时发送的消息(&颜色单词&可以设置颜色)'),
    event: Schema.bitset(mcEvent).description("选择需要监听的事件"),
}).collapse().description("Websocket客户端配置")
  
export interface rconConf {
    rconEnable: boolean,
    rconServerHost: string,
    rconServerPort: number,
    rconPassword: string,
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
    rconServerPort: Schema.number().default(25575)
    .description('rcon服务器地址端口'),
    rconPassword: Schema.string().role('secret')
    .description('rcon服务器的密码(推荐设置)'),
    alluser: Schema.boolean().default(false)
    .description('所有用户可用(开启后下面的配置失效)'),
    superuser: Schema.array(String)
    .description('超级用户的ID，可以使用RCON所有命令'),
    commonCmd: Schema.array(String).default(['list','spigot:tps'])
    .description('普通用户可以使用的命令'),
    cannotCmd: Schema.array(String).default(['restart','stop']).description('不能使用的命令'),
}).collapse().description("RCON配置")

export const eventList = ['AsyncPlayerChatEvent', 'PlayerCommandPreprocessEvent', 'PlayerDeathEvent', 'PlayerJoinEvent', 'PlayerQuitEvent'];
export const eventTrans = {
    AsyncPlayerChatEvent: {
        name: "聊天信息",
        action: '说'
    },
    PlayerCommandPreprocessEvent: {
        name: "玩家命令执行事件",
        action: "发送了命令"
    },
    PlayerDeathEvent: {
        name: "玩家死亡事件",
        action: null
    },
    PlayerJoinEvent: {
        name: "玩家加入事件",
        action: "加入了服务器"
    },
    PlayerQuitEvent: {
        name: "玩家退出事件",
        action: "离开了服务器"
    }
}

// 事件映射
export function getSubscribedEvents(input: number | mcEvent): string[] {
    const subscribedEvents: string[] = [];
    const eventValues = Object.values(mcEvent).filter(value => typeof value === 'number') as number[];

    for (let i = 0; i < eventValues.length; i++) {
        if ((input & eventValues[i]) !== 0) {
            subscribedEvents.push(eventList[i]);
        }
    }

    return subscribedEvents;
}

// 事件映射变量
const eventMap = {
    AsyncPlayerChatEvent: 'AsyncPlayerChatEvent',
    ServerMessageEvent: 'AsyncPlayerChatEvent',
    ServerChatEvent: 'AsyncPlayerChatEvent',

    PlayerCommandPreprocessEvent: 'PlayerCommandPreprocessEvent',
    ServerCommandMessageEvent: 'PlayerCommandPreprocessEvent',

    PlayerDeathEvent: 'PlayerDeathEvent',
    ServerLivingEntityAfterDeathEvent: 'PlayerDeathEvent',
    PlayerRespawnEvent: 'PlayerDeathEvent',

    PlayerJoinEvent: 'PlayerJoinEvent',
    ServerPlayConnectionJoinEvent: 'PlayerJoinEvent',
    PlayerLoggedInEvent: 'PlayerJoinEvent',

    PlayerQuitEvent: 'PlayerQuitEvent',
    ServerPlayConnectionDisconnectEvent: 'PlayerQuitEvent',
    PlayerLoggedOutEvent: 'PlayerQuitEvent',
};

// 监听映射
export function getListeningEvent(input: string | string[]): string {
    if (typeof input === 'string') {
        input = [input];
    }

    const uniqueEvents = new Set<string>();

    for (const event of input) {
        if (eventMap[event]) {
            uniqueEvents.add(eventMap[event]);
        }
    }

    // 如果有多个映射结果，返回第一个
    return Array.from(uniqueEvents)[0];
}
