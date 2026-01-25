import { Schema } from 'koishi'

// 放在主逻辑里面很碍眼的东西
export enum mcEvent {
    AsyncPlayerChatEvent = 1 << 0,
    PlayerCommandPreprocessEvent = 1 << 1,
    PlayerDeathEvent = 1 << 2,
    PlayerJoinEvent = 1 << 3,
    PlayerQuitEvent = 1 << 4,
    PlayerAchievementEvent = 1 << 5
}

export interface wsConf {
    wsServer: boolean | string,
    wsHost: string,
    wsPort: number,
    Token: string,
    serverName: string,
    joinMsg: string,
    event: mcEvent,
    maxReconnectCount: number,
    maxReconnectInterval: number,
}

export const wsConf = Schema.object({
    wsServer: Schema.union(['客户端','服务端']).default('客户端')
    .description("Websocket端选择"),
    wsHost: Schema.string().default('127.0.0.1')
    .description("websocket服务器的地址(服务器监听地址)"),
    wsPort: Schema.number().default(8080)
    .description("websocket服务器的端口(服务器监听端口)"),
    Token: Schema.string()
    .description("websocket服务器的验证Token"),
    serverName: Schema.string()
    .description("鹊桥配置文件中对应的server_name"),
    joinMsg: Schema.string().default("[客户端] 连接成功！")
    .description('连接服务的成功时发送的消息(&颜色单词&可以设置颜色)'),
    event: Schema.bitset(mcEvent).description("选择需要监听的事件"),
    maxReconnectCount: Schema.number().default(20)
    .description("[仅客户端生效]客户端最大重连次数"),
    maxReconnectInterval: Schema.number().default(60000)
    .description("[仅客户端生效]客户端单次重连时间(ms)"),
}).collapse().description("Websocket配置")

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

export const eventList = ['AsyncPlayerChatEvent', 'PlayerCommandPreprocessEvent', 'PlayerDeathEvent', 'PlayerJoinEvent', 'PlayerQuitEvent', 'PlayerAchievementEvent'];

// 事件映射
export function getSubscribedEvents(binaryInput: number): string[] {
    const subscribedEvents: string[] = [];
    const eventValues = Object.values(mcEvent).filter(value => typeof value === 'number') as number[];
    const eventNames = Object.keys(mcEvent).filter(key => isNaN(Number(key)));

    for (let i = 0; i < eventValues.length; i++) {
        if ((binaryInput & eventValues[i]) !== 0) {
            subscribedEvents.push(eventNames[i]);
        }
    }

    return subscribedEvents;
}

// 事件映射变量
const eventMap = {
    AsyncPlayerChatEvent: 'AsyncPlayerChatEvent',
    ServerMessageEvent: 'AsyncPlayerChatEvent',
    ServerChatEvent: 'AsyncPlayerChatEvent',
    NeoServerChatEvent: 'AsyncPlayerChatEvent',
    MinecraftPlayerChatEvent: 'AsyncPlayerChatEvent',
    BaseChatEvent: 'AsyncPlayerChatEvent',
    PlayerChatEvent: 'AsyncPlayerChatEvent',

    PlayerCommandPreprocessEvent: 'PlayerCommandPreprocessEvent',
    ServerCommandMessageEvent: 'PlayerCommandPreprocessEvent',
    CommandEvent: 'PlayerCommandPreprocessEvent',
    NeoCommandEvent: 'PlayerCommandPreprocessEvent',
    BasePlayerCommandEvent: 'PlayerCommandPreprocessEvent',
    PlayerCommandEvent: 'PlayerCommandPreprocessEvent',

    PlayerDeathEvent: 'PlayerDeathEvent',
    NeoPlayerDeathEvent: 'PlayerDeathEvent',
    ServerLivingEntityAfterDeathEvent: 'PlayerDeathEvent',
    BaseDeathEvent: 'PlayerDeathEvent',

    PlayerJoinEvent: 'PlayerJoinEvent',
    ServerPlayConnectionJoinEvent: 'PlayerJoinEvent',
    PlayerLoggedInEvent: 'PlayerJoinEvent',
    NeoPlayerLoggedInEvent: 'PlayerJoinEvent',
    MinecraftPlayerJoinEvent: 'PlayerJoinEvent',
    BaseJoinEvent: 'PlayerJoinEvent',

    PlayerQuitEvent: 'PlayerQuitEvent',
    ServerPlayConnectionDisconnectEvent: 'PlayerQuitEvent',
    PlayerLoggedOutEvent: 'PlayerQuitEvent',
    NeoPlayerLoggedOutEvent: 'PlayerQuitEvent',
    MinecraftPlayerQuitEvent: 'PlayerQuitEvent',
    BaseQuitEvent: 'PlayerQuitEvent',

    VelocityDisconnectEvent: 'PlayerQuitEvent',
    VelocityCommandExecuteEvent: 'PlayerCommandPreprocessEvent',
    VelocityLoginEvent: 'PlayerJoinEvent',
    VelocityPlayerChatEvent: 'AsyncPlayerChatEvent',

    PlayerAchievementEvent: 'PlayerAchievementEvent',
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
