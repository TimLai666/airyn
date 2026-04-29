/**
 * Airyn Ground — mainview entry script.
 *
 * Sections:
 *   1. Types
 *   2. i18n dictionaries (zh / en)
 *   3. State store + persistence
 *   4. DOM helpers
 *   5. View router (chapter tabs)
 *   6. Camera switcher
 *   7. Demo simulator (telemetry / sensors / GPS / battery)
 *   8. Connect / disconnect flow (flight + mission)
 *   9. Log filter + search
 *  10. Calibration interactions
 *  11. Settings interactions
 *  12. Init
 */

// ---------- 1. Types ----------

type Lang = "zh" | "en";
type Transport = "serial" | "udp" | "mission";
type LogLevel = "info" | "telem" | "warn" | "err";
type LogFilter = "all" | LogLevel;
type VehicleColor = "ochre" | "ice" | "ok";
type LinkMode = "direct" | "via-mission";
type LinkTransport = "serial" | "udp" | "tcp" | "ws";
type VehicleMode = "standby" | "manual" | "hold" | "mission" | "rtl" | "land";
type SafetyState = "offline" | "preflight" | "armed" | "failsafe";
type VehicleCommand = "arm" | "disarm" | "hold" | "mission" | "rtl" | "land" | "kill";
type WaypointType = "wp.takeoff" | "wp.waypt" | "wp.land";

const VIEW_NAMES = ["combined", "cameras", "sensors", "mission", "calibration", "log", "settings"] as const;
type ViewName = typeof VIEW_NAMES[number];

const COMMAND_LABEL_KEYS: Record<VehicleCommand, string> = {
  arm: "btn.arm",
  disarm: "btn.disarm",
  hold: "btn.hold",
  mission: "btn.mission_start",
  rtl: "btn.rtl",
  land: "btn.land",
  kill: "btn.kill",
};

const COMMAND_META_KEYS: Record<VehicleCommand, string> = {
  arm: "btn.arm.meta",
  disarm: "btn.disarm.meta",
  hold: "btn.hold.meta",
  mission: "btn.mission_start.meta",
  rtl: "btn.rtl.meta",
  land: "btn.land.meta",
  kill: "btn.kill.meta",
};

const COMMAND_SHORTCUTS: Record<VehicleCommand, string> = {
  arm: "A",
  hold: "H",
  mission: "M",
  rtl: "R",
  land: "L",
  disarm: "D",
  kill: "K",
};

const COMMAND_KEYMAP: Record<string, VehicleCommand> = {
  a: "arm",
  h: "hold",
  m: "mission",
  r: "rtl",
  l: "land",
  d: "disarm",
  k: "kill",
};

const LOG_LIMIT = 500;
const KILL_CONFIRM_MS = 3000;
const MISSION_MAX_WAYPOINTS = 60;
const MISSION_MAX_DISTANCE_M = 10000;

declare const L: any;

interface VehicleLink {
  // How ground reaches the flight controller.
  //   "direct"      — ground connects straight to the FC (serial / UDP)
  //   "via-mission" — ground talks to an onboard mission computer; the
  //                   mission computer relays to the FC. The two paths
  //                   are mutually exclusive on the same airframe.
  mode: LinkMode;
  transport: LinkTransport;
  endpoint: string;          // human-readable target: "COM3 @ 921600", "127.0.0.1:14550", "airyn-mc-01.local:7700"
}

interface Vehicle {
  id: string;
  callsign: string;
  color: VehicleColor;
  link: VehicleLink;
  flight: boolean;
  /** aircraft ↔ ground link health. false → telemetry has stalled. */
  linkActive: boolean;
  // last-known position (frozen while !linkActive)
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  // GPS state (as last reported by the aircraft)
  gpsActive: boolean;
  gpsSats: number;
  gpsHdop: number;
  // aircraft is dead-reckoning onboard with IMU (link still up)
  insActive: boolean;
  // history (renderer-owned, built from incoming frames)
  gpsTrack: [number, number][];   // continuous polyline (paused during INS or link loss)
  insTrack: [number, number][];   // aircraft-side INS segment, while gpsActive=false but linkActive=true
  predictedTrack: [number, number][]; // ground-side prediction segment, while !linkActive
  /** Snapshot at the moment of link loss; used by the prediction tick. */
  predictionStart: { lat: number; lon: number; heading: number; speed: number; tMs: number } | null;
  // attitude / telemetry
  mode: VehicleMode;
  safetyState: SafetyState;
  preflightOk: boolean;
  missionUploaded: boolean;
  missionCount: number;
  missionActiveIndex: number | null;
  roll: number; pitch: number; yaw: number;
  thr: number; vbat: number; armed: boolean;
  // sensors
  gyroX: number; gyroY: number; gyroZ: number;
  accelX: number; accelY: number; accelZ: number;
  baroAlt: number; baroVs: number; baroP: number; baroT: number;
  batI: number; batUsed: number;
  // Leaflet refs (mutable, initialized lazily)
  marker: any;
  gpsLine: any;
  insLine: any;
  predictedLine: any;
}

interface State {
  lang: Lang;
  view: ViewName;
  cam: string;
  flight: boolean;
  mission: boolean;
  recording: boolean;
  ir: boolean;
  transport: Transport;
  calStep: number;
  calCaptured: Record<number, number>;
  calMaxCaptures: Record<number, number>;
  filter: LogFilter;
  search: string;
  vehicles: Vehicle[];
  activeVehicleId: string;
  settings: AppSettings;
}

interface AppSettings {
  serialPort: string;
  baud: string;
  udpHost: string;
  udpPort: string;
  missionHost: string;
}

interface LogEntry {
  ts: string;
  tag: string;
  level: LogLevel;
  msgKey: string;
  msgArgs?: (string | number)[];
}

// ---------- 2. i18n ----------

const dicts: Record<Lang, Record<string, string>> = {
  zh: {
    "brand.sub": "地面控制台",
    "lang.zh": "中",
    "lang.en": "EN",
    "meta.sector": "區域 · 測試平台",
    "meta.frame": "QUAD-X · 角速度",

    "rail.flight.key": "連線狀態",
    "rail.linkpath.key": "連線路徑",
    "rail.vehicle.key": "載具",
    "rail.mode.key": "模式",
    "rail.flight.foot": "尚無遙測串流",
    "rail.flight.foot.connected": "100 Hz · 0 ms 延遲",
    "rail.flight.foot.via_mission": "100 Hz · 經任務電腦轉送",
    "rail.linkpath.foot": "—",
    "rail.vehicle.foot": "quad-x · rp2350a",
    "rail.mode.foot": "工作台配置 · 安全",
    "linkpath.direct": "地面直連飛控",
    "linkpath.via_mission": "經機載任務電腦",

    "val.offline": "離線",
    "val.online": "已連線",
    "val.testbench": "測試機",
    "val.rate": "角速度",
    "val.armed.no": "否",
    "val.armed.yes": "是",
    "mode.standby": "待命",
    "mode.manual": "手動",
    "mode.hold": "位置保持",
    "mode.mission": "任務",
    "mode.rtl": "返航",
    "mode.land": "降落",
    "safety.offline": "離線",
    "safety.preflight": "起飛前檢查",
    "safety.armed": "已武裝",
    "safety.failsafe": "失效保護",
    "sb.commands": "飛行指令",
    "sb.commands.state": "{0}",

    "btn.connect_flight": "連線",
    "btn.connect_flight.meta": "{0}",
    "btn.disconnect_flight": "中斷連線",
    "btn.disconnect_flight.meta": "SHIFT+RETURN",
    "btn.disconnect_locked": "連線保持",
    "btn.disconnect_locked.meta": "先降落或解除武裝",
    "btn.arm": "武裝",
    "btn.arm.meta": "允許馬達輸出",
    "btn.disarm": "解除武裝",
    "btn.disarm.meta": "停止一般輸出",
    "btn.hold": "保持位置",
    "btn.hold.meta": "懸停於目前位置",
    "btn.mission_start": "執行任務",
    "btn.mission_start.meta": "使用已上傳計畫",
    "btn.rtl": "返航",
    "btn.rtl.meta": "返回起點",
    "btn.land": "降落",
    "btn.land.meta": "受控下降",
    "btn.kill": "馬達切斷",
    "btn.kill.meta": "空中會墜落",
    "btn.kill.confirm": "確認切斷",
    "btn.kill.confirm.meta": "3 秒內再按一次",
    "cmd.reason.offline": "載具離線",
    "cmd.reason.link_lost": "空地鏈路中斷",
    "cmd.reason.preflight": "起飛前檢查未通過",
    "cmd.reason.already_armed": "已武裝",
    "cmd.reason.disarmed": "尚未武裝",
    "cmd.reason.plan_dirty": "任務已修改，需重新上傳",
    "cmd.reason.no_upload": "尚未上傳任務",
    "cmd.shortcut": "快捷鍵 {0}",

    "tab.map": "地圖",
    "tab.combined": "主控",
    "tab.cameras": "攝影機",
    "tab.sensors": "感測器",
    "tab.mission": "任務",
    "tab.calibration": "校準",
    "tab.log": "紀錄",
    "tab.settings": "設定",
    "sb.active": "主控載具",
    "sb.frame": "機型 / 模式",

    "fleet.key": "機隊",
    "fleet.summary": "{0} / {1} 機已連線",
    "map.legend.gps": "GPS 軌跡",
    "map.legend.ins": "INS 慣性推算（機載）",
    "map.legend.predicted": "預測軌跡（失聯）",
    "map.legend.ring": "距離圈",
    "log.tag.ins": "INS",
    "log.msg.gps_lost": "{0} GPS 信號中斷 · 機載 INS 接管",
    "log.msg.gps_resume": "{0} GPS 重新取得 · 機載 INS 解除",
    "log.msg.link_lost": "{0} 與地面失去連線 · 凍結於 ({1}, {2}) · 改用地面端推算",
    "log.msg.link_resume": "{0} 連線恢復",
    "log.msg.fleet_connect": "機隊連線 · {0} 機在線",
    "log.msg.fleet_disconnect": "機隊全部離線",
    "log.msg.veh_select": "切換主控載具 · {0}",

    "plate.class": "地形圖 · 04",
    "plate.foot.bearing": "方位",
    "plate.foot.range": "距離",
    "plate.foot.alt": "高度",
    "plate.foot.sat": "衛星",
    "reticle.tag.pend": "目標鎖定 · 待命",
    "reticle.tag.live": "目標鎖定 · 即時",

    "readout.telemetry": "遙測",
    "readout.safe_disarmed": "安全 / 未武裝",
    "readout.armed_active": "已武裝 / 飛行中",
    "readout.link_lost": "連線中斷 / 推算",
    "readout.ins_active": "INS / 無 GPS",
    "tel.roll": "滾轉",
    "tel.pitch": "俯仰",
    "tel.yaw": "偏航",
    "tel.thr": "油門",
    "tel.vbat": "電壓",
    "tel.armed": "武裝",
    "readout.queue": "航線佇列",
    "queue.tasks": "{0} 項任務",
    "queue.hold": "保持位置",
    "queue.await": "等待載具連線",
    "queue.upload": "上傳飛行計畫",
    "queue.pend": "待命",
    "queue.wait": "等待",
    "queue.queued": "排程",

    "cam.feed": "鏡頭 · {0}",
    "cam.fpv": "FPV",
    "cam.opt": "雲台 OPT",
    "cam.ir": "雲台 IR",
    "cam.payload": "酬載",
    "cam.no_signal": "無訊號",
    "cam.live": "直播",
    "cam.stby": "待命",
    "cam.off": "關閉",
    "cam.rec": "錄影中",
    "cam.foot.res": "解析度",
    "cam.foot.fps": "FPS",
    "cam.foot.lat": "延遲",
    "cam.foot.br": "速率",
    "ctl.gimbal_pitch": "雲台 · 俯仰",
    "ctl.gimbal_yaw": "雲台 · 偏航",
    "ctl.zoom": "縮放",
    "btn.rec": "錄影",
    "btn.stop_rec": "停止錄影",
    "btn.snap": "拍攝",
    "btn.ir_opt": "紅外 / 可見",

    "sens.gyro": "IMU · 陀螺儀",
    "sens.accel": "IMU · 加速度",
    "sens.mag": "磁力 · 羅盤",
    "sens.gps": "GPS · 位置",
    "sens.baro": "氣壓 · 高度",
    "sens.battery": "電池 · 6S",
    "sens.rc": "RC 連線 · ELRS 2.4",
    "sens.data": "資料連線 · 遙測",
    "state.ok": "正常",
    "state.cal": "需校準",
    "state.no_fix": "無定位",
    "state.fix_3d": "3D 定位",
    "state.disconnected": "未連接",
    "state.connected": "已連接",
    "state.no_signal": "無訊號",
    "gps.fix": "定位",
    "gps.fix.none": "無",
    "gps.fix.three_d": "3D",
    "gps.sat": "衛星",
    "gps.lat": "緯度",
    "gps.lon": "經度",
    "gps.alt": "高度",
    "baro.alt": "高度",
    "baro.vs": "升降",
    "baro.p": "壓力",
    "baro.t": "溫度",
    "bat.vbat": "電壓",
    "bat.i": "電流",
    "bat.used": "已用",
    "bat.est": "估時",
    "rc.ail": "副翼",
    "rc.ele": "升降",
    "rc.thr": "油門",
    "rc.rud": "方向",
    "data.transport": "傳輸",
    "data.baud": "鮑率 / 更新",
    "data.latency": "延遲",
    "data.loss": "封包遺失",
    "data.rxtx": "RX / TX",

    "mission.plate": "計畫圖 · 草稿",
    "mission.summary": "{0} 個航點 · {1} 圍欄",
    "mission.foot.dist": "距離",
    "mission.foot.eta": "預計",
    "mission.foot.alt_min": "最低",
    "mission.foot.alt_max": "最高",
    "panel.height_profile": "高度剖面",
    "panel.terrain_relative": "地形 / 載具",
    "profile.planned_current": "計畫 / 即時",
    "terrain.estimated": "地形估算",
    "terrain.clearance": "離地裕度",
    "terrain.msl": "海拔",
    "terrain.agl": "離地",
    "terrain.ground": "地面",
    "terrain.bearing": "方位",
    "mission.waypoints": "航點",
    "mission.planned": "{0} 已規劃",
    "mission.col.idx": "#",
    "mission.col.type": "類型",
    "mission.col.lat": "緯度",
    "mission.col.lon": "經度",
    "mission.col.alt": "高度",
    "mission.col.actions": "動作",
    "mission.uploaded": "{0} 個已上傳",
    "mission.summary.invalid": "{0} 個航點 · 需修正",
    "mission.invalid.empty": "任務需要至少 2 個航點",
    "mission.invalid.too_many": "航點上限 {0} 個",
    "mission.invalid.coord": "第 {0} 點座標無效",
    "mission.invalid.alt": "第 {0} 點高度需在 0-500 m",
    "mission.invalid.low_alt": "第 {0} 點非降落高度至少 5 m",
    "mission.invalid.endpoints": "需要起飛點與降落點",
    "mission.invalid.distance": "總距離不可超過 {0} km",
    "wp.takeoff": "起飛",
    "wp.waypt": "航點",
    "wp.land": "降落",
    "btn.new_wp": "新增航點",
    "btn.upload": "上傳計畫",
    "btn.download": "下載",
    "btn.clear": "清除",

    "cal.step1": "加速度 · 六向",
    "cal.step2": "陀螺儀 · 靜置",
    "cal.step3": "磁力計 · 旋轉",
    "cal.step4": "水平校正",
    "cal.state.pending": "待執行",
    "cal.state.in_progress": "進行中",
    "cal.state.done": "完成",
    "cal.state.needed": "需要",
    "cal.prompt.class": "步驟 {0} · {1}",
    "cal.prompt.title.1": "將載具水平靜置於平面",
    "cal.prompt.title.2": "保持載具靜止",
    "cal.prompt.title.3": "依各方向旋轉載具",
    "cal.prompt.title.4": "在平面校正水平",
    "cal.prompt.body.1": "保持機架靜止。擷取後，將會引導你進行另外五種姿勢：機頭上、機頭下、左側朝下、右側朝下、倒置。",
    "cal.prompt.body.2": "保持載具完全靜止 5 秒，系統會記錄陀螺儀偏差。",
    "cal.prompt.body.3": "緩慢繞各個軸旋轉，直到所有方向都被取樣為止。建議室外、遠離磁干擾。",
    "cal.prompt.body.4": "讓載具靜止於平面後擷取，系統會記錄初始姿態作為水平基準。",
    "cal.capture": "擷取位置 {0}/{1}",
    "cal.start": "開始 {0}",
    "cal.skip": "跳過步驟",
    "cal.session": "本次進度",
    "cal.steps_count": "{0} / {1} 步",
    "cal.attitude": "姿態 {0}° / {1}°",

    "chip.all": "全部",
    "chip.info": "資訊",
    "chip.telem": "遙測",
    "chip.warn": "警告",
    "chip.error": "錯誤",
    "log.search": "搜尋",
    "log.placeholder": "篩選訊息…",
    "log.count": "{0} / {1}",
    "log.tag.sys": "系統",
    "log.tag.view": "視圖",
    "log.tag.link": "連線",
    "log.tag.safe": "安全",
    "log.tag.model": "模型",
    "log.tag.map": "地圖",
    "log.tag.ui": "介面",
    "log.tag.gps": "GPS",
    "log.tag.cal": "校準",
    "log.tag.cmd": "指令",
    "log.msg.boot": "Airyn Ground 啟動 · v0.1.0",
    "log.msg.view_loaded": "主視圖載入 · 1180×780",
    "log.msg.awaiting": "等待飛控連線於 serial / udp",
    "log.msg.prearm": "起飛前檢查：未校準 · 無 GPS · 無 RC 連線",
    "log.msg.model": "目前模型 · dev/testbench · quad-x",
    "log.msg.map_origin": "地形圖原點 · 24°47′12″N 121°00′32″E",
    "log.msg.no_fc": "未偵測到飛控 · 待機",
    "log.msg.ready": "操作員介面就緒 · 等待連線",
    "log.msg.connected": "{0} 飛控已連線 · 遙測 100 Hz · {1}",
    "log.msg.connected_via_mission": "{0} 任務電腦握手成功 · {1} → 中繼飛控遙測",
    "log.msg.link_config": "{0} 連線設定已套用 · {1}",
    "log.msg.disconnected": "{0} 飛控連線中斷",
    "log.msg.disconnect_blocked_armed": "{0} 仍在武裝狀態，請先降落或解除武裝再中斷連線",
    "log.msg.gps_fix": "{0} GPS 取得 3D 定位 · {1} 顆衛星",
    "log.msg.cal_capture": "已擷取校準姿勢 {0} / 步驟 {1}",
    "log.msg.cal_step_done": "校準步驟 {1} 完成",
    "log.msg.plan_upload": "已上傳計畫 · {0} 航點",
    "log.msg.plan_clear": "已清空計畫",
    "log.msg.plan_new": "新增航點 · #{0}",
    "log.msg.plan_download": "已匯出計畫 · {0} 航點",
    "log.msg.plan_update": "已更新航點 · #{0}",
    "log.msg.plan_delete": "已刪除航點 · #{0}",
    "log.msg.command_sent": "已送出指令 · {0}",
    "log.msg.command_rejected_reason": "指令未執行 · {0} · {1}",
    "log.msg.kill_confirm": "{0} 馬達切斷需二次確認：3 秒內再按一次",
    "log.msg.plan_invalid": "任務未上傳 · {0}",
    "log.msg.command_rejected_offline": "{0} 離線，指令未執行",
    "log.msg.command_rejected_disarmed": "{0} 未武裝，指令未執行",
    "log.msg.command_rejected_no_plan": "{0} 尚未上傳任務計畫",
    "log.msg.arm_rejected": "{0} 起飛前檢查未通過，拒絕武裝",
    "log.msg.command_arm": "{0} 已武裝",
    "log.msg.command_disarm": "{0} 已解除武裝",
    "log.msg.command_hold": "{0} 進入位置保持",
    "log.msg.command_mission": "{0} 開始執行任務 · {1} 航點",
    "log.msg.command_rtl": "{0} 返航中",
    "log.msg.command_land": "{0} 降落中",
    "log.msg.command_kill": "{0} 急停已執行",
    "log.msg.auto_disarmed": "{0} 已落地並自動解除武裝",
    "log.msg.bridge_offline": "地面 bridge 尚未連線，指令未送出",
    "log.msg.lang_switch": "介面語言切換為 {0}",

    "settings.transport": "飛控連線方式",
    "transport.serial": "SERIAL",
    "transport.udp": "UDP",
    "transport.via_mission": "透過任務電腦",
    "field.port": "連接埠",
    "field.baud": "鮑率",
    "field.udp_host": "UDP 主機",
    "field.udp_port": "UDP 連接埠",
    "field.mission_host": "任務電腦位址",
    "btn.connect": "連線",
    "btn.connect.meta": "RETURN",
    "btn.disconnect": "中斷連線",
    "btn.disconnect.meta": "SHIFT+RETURN",
    "settings.model": "目前模型",
    "field.model": "模型",
    "field.board": "板子",
    "settings.preferences": "偏好設定",
    "settings.local": "本機",
    "settings.applied": "已套用",
    "field.units": "單位",
    "units.metric": "公制",
    "units.imperial": "英制",
    "field.telem_rate": "遙測更新率",
    "field.map_refresh": "地圖更新率",
    "field.lang": "介面語言",
    "lang.value.zh": "繁體中文",
    "lang.value.en": "English",

    "ledger.tag": "分類 · 作戰",
    "ledger.tag.demo": "分類 · 模擬",
    "ledger.idle": "尚無連線 · 系統正常 · 等待飛控",
    "ledger.connected": "飛控已連線 · 遙測中 · 系統正常",
    "ledger.connected.demo": "模擬連線中 · 遙測模擬中 · 無實體飛控",
  },

  en: {
    "brand.sub": "GROUND CONTROL",
    "lang.zh": "中",
    "lang.en": "EN",
    "meta.sector": "SECTOR · TESTBENCH",
    "meta.frame": "QUAD-X · RATE",

    "rail.flight.key": "LINK",
    "rail.linkpath.key": "LINK PATH",
    "rail.vehicle.key": "VEHICLE",
    "rail.mode.key": "MODE",
    "rail.flight.foot": "no telemetry stream",
    "rail.flight.foot.connected": "100 Hz · 0 ms latency",
    "rail.flight.foot.via_mission": "100 Hz · relayed via mission computer",
    "rail.linkpath.foot": "—",
    "rail.vehicle.foot": "quad-x · rp2350a",
    "rail.mode.foot": "bench config · safe",
    "linkpath.direct": "DIRECT TO FC",
    "linkpath.via_mission": "VIA ONBOARD MC",

    "val.offline": "OFFLINE",
    "val.online": "ONLINE",
    "val.testbench": "TESTBENCH",
    "val.rate": "RATE",
    "val.armed.no": "NO",
    "val.armed.yes": "YES",
    "mode.standby": "STANDBY",
    "mode.manual": "MANUAL",
    "mode.hold": "HOLD",
    "mode.mission": "MISSION",
    "mode.rtl": "RTL",
    "mode.land": "LAND",
    "safety.offline": "OFFLINE",
    "safety.preflight": "PREFLIGHT",
    "safety.armed": "ARMED",
    "safety.failsafe": "FAILSAFE",
    "sb.commands": "FLIGHT COMMANDS",
    "sb.commands.state": "{0}",

    "btn.connect_flight": "CONNECT",
    "btn.connect_flight.meta": "{0}",
    "btn.disconnect_flight": "DISCONNECT",
    "btn.disconnect_flight.meta": "SHIFT+RETURN",
    "btn.disconnect_locked": "LINK HELD",
    "btn.disconnect_locked.meta": "LAND OR DISARM FIRST",
    "btn.arm": "ARM",
    "btn.arm.meta": "ENABLE MOTORS",
    "btn.disarm": "DISARM",
    "btn.disarm.meta": "STOP NORMAL OUTPUT",
    "btn.hold": "HOLD",
    "btn.hold.meta": "KEEP CURRENT POSITION",
    "btn.mission_start": "START MISSION",
    "btn.mission_start.meta": "RUN UPLOADED PLAN",
    "btn.rtl": "RTL",
    "btn.rtl.meta": "RETURN HOME",
    "btn.land": "LAND",
    "btn.land.meta": "CONTROLLED DESCENT",
    "btn.kill": "MOTOR CUT",
    "btn.kill.meta": "AIRBORNE CRASH RISK",
    "btn.kill.confirm": "CONFIRM CUT",
    "btn.kill.confirm.meta": "PRESS AGAIN WITHIN 3S",
    "cmd.reason.offline": "vehicle offline",
    "cmd.reason.link_lost": "air-ground link lost",
    "cmd.reason.preflight": "preflight not passed",
    "cmd.reason.already_armed": "already armed",
    "cmd.reason.disarmed": "not armed",
    "cmd.reason.plan_dirty": "plan changed; upload again",
    "cmd.reason.no_upload": "no uploaded mission",
    "cmd.shortcut": "shortcut {0}",

    "tab.map": "MAP",
    "tab.combined": "COMBINED",
    "tab.cameras": "CAMERAS",
    "tab.sensors": "SENSORS",
    "tab.mission": "MISSION",
    "tab.calibration": "CALIBRATION",
    "tab.log": "LOG",
    "tab.settings": "SETTINGS",
    "sb.active": "ACTIVE VEHICLE",
    "sb.frame": "FRAME / MODE",

    "fleet.key": "FLEET",
    "fleet.summary": "{0} OF {1} ONLINE",
    "map.legend.gps": "GPS TRACK",
    "map.legend.ins": "INS DEAD-RECKON (ONBOARD)",
    "map.legend.predicted": "PREDICTED (LINK LOST)",
    "map.legend.ring": "RANGE RINGS",
    "log.tag.ins": "INS",
    "log.msg.gps_lost": "{0} GPS lost · onboard INS taking over",
    "log.msg.gps_resume": "{0} GPS reacquired · onboard INS released",
    "log.msg.link_lost": "{0} link to ground LOST · frozen at ({1}, {2}) · ground prediction engaged",
    "log.msg.link_resume": "{0} link restored",
    "log.msg.fleet_connect": "Fleet connected · {0} online",
    "log.msg.fleet_disconnect": "Fleet disconnected",
    "log.msg.veh_select": "Active vehicle · {0}",

    "plate.class": "TERRAIN PLATE · 04",
    "plate.foot.bearing": "BEARING",
    "plate.foot.range": "RANGE",
    "plate.foot.alt": "ALT",
    "plate.foot.sat": "SAT",
    "reticle.tag.pend": "TARGET LOCK · PEND",
    "reticle.tag.live": "TARGET LOCK · LIVE",

    "readout.telemetry": "TELEMETRY",
    "readout.safe_disarmed": "SAFE / DISARMED",
    "readout.armed_active": "ARMED / ACTIVE",
    "readout.link_lost": "LINK LOST / PREDICT",
    "readout.ins_active": "INS / NO GPS",
    "tel.roll": "ROLL",
    "tel.pitch": "PITCH",
    "tel.yaw": "YAW",
    "tel.thr": "THR",
    "tel.vbat": "VBAT",
    "tel.armed": "ARMED",
    "readout.queue": "ROUTE QUEUE",
    "queue.tasks": "{0} TASKS",
    "queue.hold": "Hold Position",
    "queue.await": "Await Vehicle Link",
    "queue.upload": "Upload Plan",
    "queue.pend": "PEND",
    "queue.wait": "WAIT",
    "queue.queued": "QUEUED",

    "cam.feed": "FEED · {0}",
    "cam.fpv": "FPV",
    "cam.opt": "GIMBAL OPT",
    "cam.ir": "GIMBAL IR",
    "cam.payload": "PAYLOAD",
    "cam.no_signal": "NO SIGNAL",
    "cam.live": "LIVE",
    "cam.stby": "STBY",
    "cam.off": "OFF",
    "cam.rec": "RECORDING",
    "cam.foot.res": "RES",
    "cam.foot.fps": "FPS",
    "cam.foot.lat": "LATENCY",
    "cam.foot.br": "BITRATE",
    "ctl.gimbal_pitch": "GIMBAL · PITCH",
    "ctl.gimbal_yaw": "GIMBAL · YAW",
    "ctl.zoom": "ZOOM",
    "btn.rec": "REC",
    "btn.stop_rec": "STOP REC",
    "btn.snap": "SNAP",
    "btn.ir_opt": "IR / OPT",

    "sens.gyro": "IMU · GYRO",
    "sens.accel": "IMU · ACCEL",
    "sens.mag": "MAG · COMPASS",
    "sens.gps": "GPS · POSITION",
    "sens.baro": "BARO · PRESSURE",
    "sens.battery": "BATTERY · 6S",
    "sens.rc": "RC LINK · ELRS 2.4",
    "sens.data": "DATA LINK · TELEMETRY",
    "state.ok": "OK",
    "state.cal": "CAL",
    "state.no_fix": "NO FIX",
    "state.fix_3d": "3D FIX",
    "state.disconnected": "DISCONNECTED",
    "state.connected": "CONNECTED",
    "state.no_signal": "NO SIGNAL",
    "gps.fix": "FIX",
    "gps.fix.none": "NONE",
    "gps.fix.three_d": "3D",
    "gps.sat": "SAT",
    "gps.lat": "LAT",
    "gps.lon": "LON",
    "gps.alt": "ALT",
    "baro.alt": "ALT",
    "baro.vs": "VS",
    "baro.p": "P",
    "baro.t": "T",
    "bat.vbat": "VBAT",
    "bat.i": "I",
    "bat.used": "USED",
    "bat.est": "EST",
    "rc.ail": "AIL",
    "rc.ele": "ELE",
    "rc.thr": "THR",
    "rc.rud": "RUD",
    "data.transport": "TRANSPORT",
    "data.baud": "BAUD / RATE",
    "data.latency": "LATENCY",
    "data.loss": "LOSS",
    "data.rxtx": "RX / TX",

    "mission.plate": "PLAN PLATE · DRAFT",
    "mission.summary": "{0} WAYPOINTS · {1} GEOFENCE",
    "mission.foot.dist": "DIST",
    "mission.foot.eta": "ETA",
    "mission.foot.alt_min": "ALT MIN",
    "mission.foot.alt_max": "ALT MAX",
    "panel.height_profile": "HEIGHT PROFILE",
    "panel.terrain_relative": "TERRAIN / AIRCRAFT",
    "profile.planned_current": "PLAN / LIVE",
    "terrain.estimated": "ESTIMATED",
    "terrain.clearance": "CLEARANCE",
    "terrain.msl": "MSL",
    "terrain.agl": "AGL",
    "terrain.ground": "GROUND",
    "terrain.bearing": "BRG",
    "mission.waypoints": "WAYPOINTS",
    "mission.planned": "{0} PLANNED",
    "mission.col.idx": "#",
    "mission.col.type": "TYPE",
    "mission.col.lat": "LAT",
    "mission.col.lon": "LON",
    "mission.col.alt": "ALT",
    "mission.col.actions": "ACTIONS",
    "mission.uploaded": "{0} UPLOADED",
    "mission.summary.invalid": "{0} WAYPOINTS · FIX NEEDED",
    "mission.invalid.empty": "mission needs at least 2 waypoints",
    "mission.invalid.too_many": "waypoint limit is {0}",
    "mission.invalid.coord": "waypoint {0} has invalid coordinates",
    "mission.invalid.alt": "waypoint {0} altitude must be 0-500 m",
    "mission.invalid.low_alt": "waypoint {0} needs at least 5 m unless landing",
    "mission.invalid.endpoints": "takeoff and landing points are required",
    "mission.invalid.distance": "total distance must be under {0} km",
    "wp.takeoff": "TAKEOFF",
    "wp.waypt": "WAYPT",
    "wp.land": "LAND",
    "btn.new_wp": "NEW WP",
    "btn.upload": "UPLOAD PLAN",
    "btn.download": "DOWNLOAD",
    "btn.clear": "CLEAR",

    "cal.step1": "ACCEL · 6 POSITION",
    "cal.step2": "GYRO · STILL",
    "cal.step3": "MAG · ROTATE",
    "cal.step4": "LEVEL HORIZON",
    "cal.state.pending": "PENDING",
    "cal.state.in_progress": "IN PROGRESS",
    "cal.state.done": "DONE",
    "cal.state.needed": "NEEDED",
    "cal.prompt.class": "STEP {0} · {1}",
    "cal.prompt.title.1": "PLACE VEHICLE LEVEL ON A FLAT SURFACE",
    "cal.prompt.title.2": "HOLD VEHICLE STILL",
    "cal.prompt.title.3": "ROTATE VEHICLE THROUGH ALL ORIENTATIONS",
    "cal.prompt.title.4": "LEVEL THE HORIZON ON A FLAT SURFACE",
    "cal.prompt.body.1": "Hold the airframe still. After capture, you will be guided through five additional orientations: nose-up, nose-down, left-side-down, right-side-down, inverted.",
    "cal.prompt.body.2": "Keep the vehicle perfectly still for 5 seconds while the gyroscope bias is recorded.",
    "cal.prompt.body.3": "Slowly rotate the airframe through every axis until each direction has been sampled. Outdoors, away from magnetic interference.",
    "cal.prompt.body.4": "Place the vehicle on a level surface and capture; the system will record the initial attitude as the horizon reference.",
    "cal.capture": "CAPTURE POSITION {0}/{1}",
    "cal.start": "START {0}",
    "cal.skip": "SKIP STEP",
    "cal.session": "SESSION PROGRESS",
    "cal.steps_count": "{0} OF {1} STEPS",
    "cal.attitude": "ATTITUDE {0}° / {1}°",

    "chip.all": "ALL",
    "chip.info": "INFO",
    "chip.telem": "TELEM",
    "chip.warn": "WARN",
    "chip.error": "ERROR",
    "log.search": "SEARCH",
    "log.placeholder": "filter messages…",
    "log.count": "{0} / {1}",
    "log.tag.sys": "SYS",
    "log.tag.view": "VIEW",
    "log.tag.link": "LINK",
    "log.tag.safe": "SAFE",
    "log.tag.model": "MODEL",
    "log.tag.map": "MAP",
    "log.tag.ui": "UI",
    "log.tag.gps": "GPS",
    "log.tag.cal": "CAL",
    "log.tag.cmd": "CMD",
    "log.msg.boot": "Airyn Ground started · v0.1.0",
    "log.msg.view_loaded": "Loaded mainview · 1180×780",
    "log.msg.awaiting": "Awaiting flight controller on serial / udp",
    "log.msg.prearm": "Pre-arm: NO IMU CAL · NO GPS FIX · NO RC LINK",
    "log.msg.model": "Active model · dev/testbench · quad-x",
    "log.msg.map_origin": "Terrain plate origin · 24°47′12″N 121°00′32″E",
    "log.msg.no_fc": "No flight controller detected · idle",
    "log.msg.ready": "Operator view ready · awaiting connect",
    "log.msg.connected": "{0} flight controller connected · telemetry 100 Hz · {1}",
    "log.msg.connected_via_mission": "{0} mission computer handshake OK · {1} → relaying flight controller telemetry",
    "log.msg.link_config": "{0} link settings applied · {1}",
    "log.msg.disconnected": "{0} flight controller disconnected",
    "log.msg.disconnect_blocked_armed": "{0} is armed; land or disarm before disconnecting",
    "log.msg.gps_fix": "{0} GPS acquired 3D fix · {1} satellites",
    "log.msg.cal_capture": "Captured calibration pose {0} for step {1}",
    "log.msg.cal_step_done": "Calibration step {1} complete",
    "log.msg.plan_upload": "Plan uploaded · {0} waypoints",
    "log.msg.plan_clear": "Plan cleared",
    "log.msg.plan_new": "New waypoint · #{0}",
    "log.msg.plan_download": "Plan exported · {0} waypoints",
    "log.msg.plan_update": "Waypoint updated · #{0}",
    "log.msg.plan_delete": "Waypoint deleted · #{0}",
    "log.msg.command_sent": "Command sent · {0}",
    "log.msg.command_rejected_reason": "Command not run · {0} · {1}",
    "log.msg.kill_confirm": "{0} motor cut requires confirmation: press again within 3 seconds",
    "log.msg.plan_invalid": "Mission not uploaded · {0}",
    "log.msg.command_rejected_offline": "{0} is offline; command not executed",
    "log.msg.command_rejected_disarmed": "{0} is disarmed; command not executed",
    "log.msg.command_rejected_no_plan": "{0} has no uploaded mission plan",
    "log.msg.arm_rejected": "{0} preflight failed; arm rejected",
    "log.msg.command_arm": "{0} armed",
    "log.msg.command_disarm": "{0} disarmed",
    "log.msg.command_hold": "{0} switched to hold",
    "log.msg.command_mission": "{0} started mission · {1} waypoints",
    "log.msg.command_rtl": "{0} returning home",
    "log.msg.command_land": "{0} landing",
    "log.msg.command_kill": "{0} motor stop executed",
    "log.msg.auto_disarmed": "{0} landed and auto-disarmed",
    "log.msg.bridge_offline": "Ground bridge is not connected; command was not sent",
    "log.msg.lang_switch": "UI language switched to {0}",

    "settings.transport": "FLIGHT TRANSPORT",
    "transport.serial": "SERIAL",
    "transport.udp": "UDP",
    "transport.via_mission": "VIA MISSION",
    "field.port": "PORT",
    "field.baud": "BAUD",
    "field.udp_host": "UDP HOST",
    "field.udp_port": "UDP PORT",
    "field.mission_host": "MISSION HOST",
    "btn.connect": "CONNECT",
    "btn.connect.meta": "RETURN",
    "btn.disconnect": "DISCONNECT",
    "btn.disconnect.meta": "SHIFT+RETURN",
    "settings.model": "ACTIVE MODEL",
    "field.model": "MODEL",
    "field.board": "BOARD",
    "settings.preferences": "PREFERENCES",
    "settings.local": "LOCAL",
    "settings.applied": "APPLIED",
    "field.units": "UNITS",
    "units.metric": "METRIC",
    "units.imperial": "IMPERIAL",
    "field.telem_rate": "TELEM RATE",
    "field.map_refresh": "MAP REFRESH",
    "field.lang": "INTERFACE LANGUAGE",
    "lang.value.zh": "繁體中文",
    "lang.value.en": "English",

    "ledger.tag": "CLASSIFICATION · OPERATIONS",
    "ledger.tag.demo": "CLASSIFICATION · SIMULATION",
    "ledger.idle": "No active link · System nominal · Awaiting flight controller",
    "ledger.connected": "Flight link active · Telemetry streaming · System nominal",
    "ledger.connected.demo": "Demo link active · Simulated telemetry · No physical aircraft",
  },
};

// ---------- 3. State ----------

const STORAGE_KEY = "airyn.state.v1";

function makeVehicle(
  id: string,
  callsign: string,
  color: VehicleColor,
  link: VehicleLink,
  lat: number,
  lon: number,
  heading: number,
): Vehicle {
  return {
    id, callsign, color, link,
    flight: false,
    linkActive: true,
    lat, lon,
    altitude: 0,
    speed: 8,            // m/s default cruise once connected
    heading,
    gpsActive: false,
    gpsSats: 0,
    gpsHdop: 99,
    insActive: false,
    gpsTrack: [],
    insTrack: [],
    predictedTrack: [],
    predictionStart: null,
    mode: "standby",
    safetyState: "offline",
    preflightOk: false,
    missionUploaded: false,
    missionCount: 0,
    missionActiveIndex: null,
    roll: 0, pitch: 0, yaw: heading,
    thr: 0, vbat: 0, armed: false,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    accelX: 0, accelY: 0, accelZ: 1,
    baroAlt: 0, baroVs: 0, baroP: 1013.2, baroT: 24.5,
    batI: 0, batUsed: 0,
    marker: null, gpsLine: null, insLine: null, predictedLine: null,
  };
}

// Hsinchu testbench area (24.787 N, 121.011 E) — three demo vehicles
// covering both link paths the project supports.
function makeFleet(): Vehicle[] {
  return [
    makeVehicle("v1", "AIRYN-01", "ochre",
      { mode: "direct",      transport: "serial", endpoint: "COM3 @ 921600" },
      24.78670, 121.00890, 45),
    makeVehicle("v2", "AIRYN-02", "ice",
      { mode: "via-mission", transport: "ws",     endpoint: "airyn-mc-02.local:7700" },
      24.79100, 121.01620, 270),
    makeVehicle("v3", "AIRYN-03", "ok",
      { mode: "direct",      transport: "udp",    endpoint: "127.0.0.1:14550" },
      24.78320, 121.00500, 135),
  ];
}

const initialState: State = {
  lang: "zh",
  view: "combined",
  cam: "fpv",
  flight: false,
  mission: false,
  recording: false,
  ir: false,
  transport: "serial",
  calStep: 1,
  calCaptured: { 1: 0, 2: 0, 3: 0, 4: 0 },
  calMaxCaptures: { 1: 6, 2: 1, 3: 1, 4: 1 },
  filter: "all",
  search: "",
  vehicles: makeFleet(),
  activeVehicleId: "v1",
  settings: {
    serialPort: "COM3",
    baud: "921600",
    udpHost: "127.0.0.1",
    udpPort: "14550",
    missionHost: "airyn-mc-02.local:7700",
  },
};

function isViewName(value: unknown): value is ViewName {
  return typeof value === "string" && VIEW_NAMES.includes(value as ViewName);
}

function loadState(): State {
  const s: State = {
    ...initialState,
    settings: { ...initialState.settings },
    calCaptured: { ...initialState.calCaptured },
    vehicles: makeFleet(),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return s;
    const stored = JSON.parse(raw);
    if (stored.lang === "zh" || stored.lang === "en") s.lang = stored.lang;
    if (stored.transport === "serial" || stored.transport === "udp" || stored.transport === "mission") {
      s.transport = stored.transport;
    }
    if (isViewName(stored.view)) s.view = stored.view;
    if (typeof stored.activeVehicleId === "string" && s.vehicles.some((v) => v.id === stored.activeVehicleId)) {
      s.activeVehicleId = stored.activeVehicleId;
    }
    if (stored.settings && typeof stored.settings === "object") {
      s.settings = {
        serialPort: typeof stored.settings.serialPort === "string" ? stored.settings.serialPort : s.settings.serialPort,
        baud: typeof stored.settings.baud === "string" ? stored.settings.baud : s.settings.baud,
        udpHost: typeof stored.settings.udpHost === "string" ? stored.settings.udpHost : s.settings.udpHost,
        udpPort: typeof stored.settings.udpPort === "string" ? stored.settings.udpPort : s.settings.udpPort,
        missionHost: typeof stored.settings.missionHost === "string" ? stored.settings.missionHost : s.settings.missionHost,
      };
    }
  } catch {
    /* ignore */
  }
  return s;
}

const state = loadState();

function activeVehicle(): Vehicle {
  return state.vehicles.find((v) => v.id === state.activeVehicleId) ?? state.vehicles[0]!;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lang: state.lang,
      view: state.view,
      transport: state.transport,
      activeVehicleId: state.activeVehicleId,
      settings: state.settings,
    }));
  } catch {
    /* ignore */
  }
}

function t(key: string, ...args: (string | number)[]): string {
  const raw = dicts[state.lang][key] ?? dicts.en[key] ?? key;
  if (args.length === 0) return raw;
  return raw.replace(/\{(\d+)\}/g, (_, i) => {
    const v = args[Number(i)];
    return v === undefined ? "" : String(v);
  });
}

// ---------- 4. DOM helpers ----------

function $<E extends HTMLElement = HTMLElement>(sel: string): E | null {
  return document.querySelector<E>(sel);
}
function $$<E extends HTMLElement = HTMLElement>(sel: string): E[] {
  return Array.from(document.querySelectorAll<E>(sel));
}

function applyI18n(): void {
  document.documentElement.lang = state.lang;
  $$("[data-i18n]").forEach((el) => {
    const key = el.dataset["i18n"];
    if (key) el.textContent = t(key);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset["i18nPlaceholder"];
    if (key && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.placeholder = t(key);
    }
  });
  $$("[data-i18n-aria]").forEach((el) => {
    const key = el.dataset["i18nAria"];
    if (key) el.setAttribute("aria-label", t(key));
  });
}

// ---------- 5. View router ----------

function setView(name: string): void {
  const viewName = isViewName(name) ? name : "combined";
  state.view = viewName;
  $$<HTMLButtonElement>("[data-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset["tab"] === viewName);
  });
  $$<HTMLElement>(".view[data-view]").forEach((view) => {
    view.hidden = view.dataset["view"] !== viewName;
  });
  // The single Leaflet map element is moved between the MAP and COMBINED
  // view slots so we don't pay the cost of two map instances + duplicate
  // markers/polylines.
  ensureMapMounted(viewName);
  persist();
}

function ensureMapMounted(viewName: string): void {
  const mapEl = document.getElementById("map-main");
  if (!mapEl) return;
  const slot =
    viewName === "combined" ? document.getElementById("map-slot-combined") :
    document.getElementById("map-slot-main");
  if (slot && mapEl.parentElement !== slot) {
    slot.appendChild(mapEl);
  }
  if (leafletMap && (viewName === "map" || viewName === "combined")) {
    requestAnimationFrame(() => leafletMap.invalidateSize());
  }
}

// ---------- 6. Camera switcher ----------

function setCam(name: string): void {
  state.cam = name;
  $$<HTMLButtonElement>(".cam--thumb[data-cam]").forEach((thumb) => {
    thumb.classList.toggle("is-active", thumb.dataset["cam"] === name);
  });
  const labelKey = `cam.${name}`;
  const main = $<HTMLElement>(".cam--main .cam-class");
  if (main) main.textContent = t("cam.feed", t(labelKey));
}

function toggleRec(): void {
  state.recording = !state.recording;
  const recEl = $<HTMLElement>(".cam--main .cam-rec");
  const recBtn = $<HTMLElement>("[data-action='rec'] .op-btn-label");
  if (recEl) {
    recEl.classList.toggle("is-rec", state.recording);
    const text = recEl.querySelector(".cam-rec-text");
    if (text) text.textContent = state.recording ? t("cam.rec") : (state.flight ? t("cam.live") : t("cam.no_signal"));
  }
  if (recBtn) recBtn.textContent = state.recording ? t("btn.stop_rec") : t("btn.rec");
}

function toggleIROpt(): void {
  state.ir = !state.ir;
  // visual cue: tint main feed
  const main = $<HTMLElement>(".cam--main");
  if (main) main.classList.toggle("is-ir", state.ir);
}

// ---------- 7. Map + bridge client (telemetry comes from src/bun/sim) ----------

let leafletMap: any = null;
let rangeRingLayers: any[] = [];
let serverSimTime = 0;

function jitter(base: number, span: number): number {
  return base + (Math.random() - 0.5) * span * 2;
}

function fmtSigned(n: number, decimals: number, width: number): string {
  const s = n >= 0 ? "+" : "";
  return s + n.toFixed(decimals).padStart(width, " ");
}

function pad3(n: number): string {
  const v = Math.floor(((n % 360) + 360) % 360);
  return v.toString().padStart(3, "0");
}

function setText(sel: string, text: string): void {
  const el = $(sel);
  if (el) el.textContent = text;
}

// ---- Leaflet map setup ----

function initMap(): void {
  if (leafletMap) return;
  if (typeof (window as any).L === "undefined") {
    console.warn("[airyn] Leaflet not loaded — map disabled");
    return;
  }
  const el = document.getElementById("map-main");
  if (!el) return;

  leafletMap = L.map(el, {
    zoomControl: true,
    attributionControl: false,
    minZoom: 4,
    maxZoom: 19,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    fadeAnimation: false,
    inertia: true,
  }).setView([24.787, 121.011], 14);

  // Carto Voyager — neutral cream basemap with subtle road colours.
  // Matches a real GCS look while keeping the cinematic chrome readable.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(leafletMap);

  for (const v of state.vehicles) {
    setupVehicleLayers(v);
  }
  setActiveVehicle(state.activeVehicleId, false);
  scheduleOperationalMapFit();
}

function setupVehicleLayers(v: Vehicle): void {
  if (!leafletMap || v.marker) return;
  const icon = L.divIcon({
    className: `airyn-marker color-${v.color}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html:
      '<span class="m-corner m-corner--tl"></span>' +
      '<span class="m-corner m-corner--tr"></span>' +
      '<span class="m-corner m-corner--bl"></span>' +
      '<span class="m-corner m-corner--br"></span>' +
      '<span class="m-dot"></span>' +
      `<span class="m-tag">${escapeHtml(v.callsign)}</span>`,
  });
  v.marker = L.marker([v.lat, v.lon], { icon, riseOnHover: true }).addTo(leafletMap);
  v.marker.on("click", () => setActiveVehicle(v.id, true));

  const gpsColor = v.color === "ice" ? "#6c97a3" : v.color === "ok" ? "#7ea081" : "#d18b48";
  v.gpsLine = L.polyline([], { color: gpsColor, weight: 2, opacity: 0.85, smoothFactor: 1.5 }).addTo(leafletMap);
  v.insLine = L.polyline([], { color: "#d24a3a", weight: 2, opacity: 0.75, dashArray: "4 5", smoothFactor: 1 }).addTo(leafletMap);
  // Ground-side prediction during link loss — yellow long-dash so it's
  // visually distinct from the aircraft's onboard INS (red short-dash).
  v.predictedLine = L.polyline([], { color: "#e8c34a", weight: 2, opacity: 0.7, dashArray: "8 6", smoothFactor: 1 }).addTo(leafletMap);
}

function refreshMarkerClass(v: Vehicle): void {
  if (!v.marker) return;
  const el = v.marker.getElement();
  if (!el) return;
  el.classList.toggle("is-active", v.id === state.activeVehicleId);
  el.classList.toggle("is-ins", v.insActive && v.linkActive);
  el.classList.toggle("is-ghost", v.flight && !v.linkActive);
}

function updateRangeRings(): void {
  if (!leafletMap) return;
  rangeRingLayers.forEach((r) => leafletMap.removeLayer(r));
  rangeRingLayers = [];
  const v = activeVehicle();
  if (!v) return;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return;
  const radii = [50, 100, 250, 500];
  for (const r of radii) {
    const c = L.circle([v.lat, v.lon], {
      radius: r,
      color: "#d18b48",
      weight: 1,
      opacity: 0.35,
      fillOpacity: 0,
      dashArray: "3 4",
      interactive: false,
    });
    c.addTo(leafletMap);
    rangeRingLayers.push(c);
  }
}

function fitMapToOperationalContext(): void {
  if (!leafletMap || typeof L === "undefined") return;
  const coords: [number, number][] = [];
  const add = (lat: number, lon: number) => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lat, lon]);
  };
  for (const v of state.vehicles) add(v.lat, v.lon);
  for (const wp of waypoints) add(wp.lat, wp.lon);

  if (coords.length === 0) return;
  if (coords.length === 1) {
    leafletMap.setView(coords[0], Math.min(16, leafletMap.getZoom() || 14), { animate: true });
    return;
  }
  const bounds = L.latLngBounds(coords);
  if (bounds?.isValid?.()) {
    leafletMap.fitBounds(bounds.pad(0.18), { animate: true, duration: 0.35, maxZoom: 16 });
  }
}

function scheduleOperationalMapFit(): void {
  if (!leafletMap) return;
  requestAnimationFrame(fitMapToOperationalContext);
}

function setActiveVehicle(id: string, recenter: boolean): void {
  const next = state.vehicles.find((v) => v.id === id);
  if (!next) return;
  state.activeVehicleId = id;
  persist();
  for (const v of state.vehicles) refreshMarkerClass(v);
  updateRangeRings();
  if (recenter && leafletMap) {
    fitMapToOperationalContext();
  }
  renderFleetChips();
  renderActive();
  renderLinkPath();
  renderActiveLinkRail();
  renderConnectButton();
  renderFlightModeRail();
  renderCommandControls();
  renderMissionActiveState();
  loadSettingsFromActiveVehicle();
  refreshTransportStatusFromActive();
  pushLog("info", "log.tag.ui", "log.msg.veh_select", next.callsign);
}

/**
 * Diff-based chip render. We never wipe and rebuild the chip DOM because
 * fleet frames fire at 10 Hz; rewriting innerHTML in the middle of a
 * mousedown/mouseup pair would kill the click. Instead each chip element
 * is created once on first sight and only its mutable bits (state dot,
 * meta badge, active class, tooltip) get updated on subsequent calls.
 */
function setTextIfChanged(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

function renderFleetChips(): void {
  const wrap = $<HTMLElement>("#fleet-chips");
  const meta = $<HTMLElement>("#fleet-meta");
  if (!wrap) return;

  const existing = new Map<string, HTMLButtonElement>();
  for (const child of Array.from(wrap.children)) {
    if (child instanceof HTMLButtonElement && child.dataset["vid"]) {
      existing.set(child.dataset["vid"]!, child);
    }
  }
  const wantedIds = new Set(state.vehicles.map((v) => v.id));

  // Drop chips for vehicles that are no longer in the fleet.
  for (const [id, el] of existing) {
    if (!wantedIds.has(id)) el.remove();
  }

  for (const v of state.vehicles) {
    let btn = existing.get(v.id);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.dataset["vid"] = v.id;
      btn.className = "fleet-chip";
      btn.innerHTML =
        '<span class="fleet-chip-dot"></span>' +
        '<span class="fleet-chip-name"></span>' +
        '<span class="fleet-chip-meta"></span>';
      btn.addEventListener("click", () => setActiveVehicle(v.id, true));
      wrap.appendChild(btn);
    }

    const stateVal =
      !v.flight ? "offline" :
      !v.linkActive ? "ghost" :
      v.insActive ? "ins" :
      "connected";
    if (btn.dataset["state"] !== stateVal) btn.dataset["state"] = stateVal;
    const isActive = v.id === state.activeVehicleId;
    btn.classList.toggle("is-active", isActive);

    const tip = `${v.callsign} · ${
      v.link.mode === "via-mission" ? "via mission computer" : "direct to flight controller"
    } · ${v.link.transport.toUpperCase()} ${v.link.endpoint}`;
    if (btn.title !== tip) btn.title = tip;

    setTextIfChanged(btn.querySelector(".fleet-chip-name"), v.callsign);
    const linkBadge = v.link.mode === "via-mission" ? "MC" : "FC";
    const stateBadge =
      !v.flight ? "" :
      !v.linkActive ? " · LOST" :
      v.insActive ? " · INS" :
      "";
    setTextIfChanged(btn.querySelector(".fleet-chip-meta"), `${linkBadge}${stateBadge}`);
  }

  if (meta) {
    const online = state.vehicles.filter((v) => v.flight).length;
    setTextIfChanged(meta, t("fleet.summary", online, state.vehicles.length));
  }
}

// ---- WebSocket client: subscribes to bun-side simulator/bridge ----

let bridgeSocket: WebSocket | null = null;
let bridgeRetryTimer: ReturnType<typeof setTimeout> | null = null;

function bridgeUrl(): string {
  // Bridge port is fixed in shared/protocol; we hard-code it here so
  // the renderer doesn't need to import shared types at runtime.
  return "ws://localhost:7711";
}

function connectBridge(): void {
  if (bridgeRetryTimer) {
    clearTimeout(bridgeRetryTimer);
    bridgeRetryTimer = null;
  }
  try {
    bridgeSocket = new WebSocket(bridgeUrl());
  } catch (err) {
    console.error("[airyn] bridge connect threw", err);
    bridgeRetryTimer = setTimeout(connectBridge, 1500);
    return;
  }

  bridgeSocket.addEventListener("open", () => {
    console.log("[airyn] bridge connected");
  });
  bridgeSocket.addEventListener("close", () => {
    console.warn("[airyn] bridge closed, retrying in 1.5s");
    bridgeSocket = null;
    bridgeRetryTimer = setTimeout(connectBridge, 1500);
  });
  bridgeSocket.addEventListener("error", (e) => {
    console.warn("[airyn] bridge error", e);
  });
  bridgeSocket.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      handleBridgeMessage(msg);
    } catch (err) {
      console.error("[airyn] bridge bad message", err);
    }
  });
}

type BridgeClientMessage =
  | { type: "connect"; id: string }
  | { type: "disconnect"; id: string }
  | { type: "configureLink"; id: string; link: VehicleLink }
  | { type: "command"; id: string; command: VehicleCommand }
  | { type: "uploadPlan"; id: string; waypoints: ServerMissionWaypoint[] }
  | { type: "calibration"; id: string; step: number; capture: number; done: boolean };

function sendBridge(cmd: BridgeClientMessage): boolean {
  if (!bridgeSocket || bridgeSocket.readyState !== 1 /* OPEN */) {
    pushLog("warn", "log.tag.link", "log.msg.bridge_offline");
    return false;
  }
  try {
    bridgeSocket.send(JSON.stringify(cmd));
    return true;
  } catch {
    pushLog("warn", "log.tag.link", "log.msg.bridge_offline");
    return false;
  }
}

interface ServerHello {
  type: "hello";
  build: string;
  port: number;
  vehicles: Array<{
    id: string;
    callsign: string;
    color: VehicleColor;
    link: { mode: LinkMode; transport: LinkTransport; endpoint: string };
  }>;
}

interface VehicleFramePayload {
  id: string;
  flight: boolean;
  linkActive: boolean;
  lat: number; lon: number;
  altitude: number; speed: number; heading: number;
  gpsActive: boolean; gpsSats: number; gpsHdop: number;
  insActive: boolean;
  mode: VehicleMode;
  safetyState: SafetyState;
  preflightOk: boolean;
  missionUploaded: boolean;
  missionCount: number;
  missionActiveIndex: number | null;
  roll: number; pitch: number; yaw: number;
  thr: number; vbat: number; armed: boolean;
  gyroX: number; gyroY: number; gyroZ: number;
  accelX: number; accelY: number; accelZ: number;
  baroAlt: number; baroVs: number; baroP: number; baroT: number;
  batI: number; batUsed: number;
}

interface ServerMissionWaypoint {
  type: "takeoff" | "waypoint" | "land";
  lat: number;
  lon: number;
  alt: number;
}

interface ServerFleetFrame {
  type: "fleet";
  t: number;
  flight: boolean;
  vehicles: VehicleFramePayload[];
}

interface ServerLogMessage {
  type: "log";
  level: "info" | "warn" | "err";
  tagKey: string;
  msgKey: string;
  msgArgs?: (string | number)[];
}

type ServerMessage = ServerHello | ServerFleetFrame | ServerLogMessage;

function handleBridgeMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "hello":   onHello(msg);       break;
    case "fleet":   applyFleetFrame(msg); break;
    case "log":     applyLogFromBridge(msg); break;
  }
}

function onHello(hello: ServerHello): void {
  // Sync per-vehicle config (link, callsign) from the server. If the
  // server's vehicle id matches an existing one we update in place; if it
  // is new we add it (and lazily build its Leaflet layers).
  for (const cfg of hello.vehicles) {
    let v = state.vehicles.find((x) => x.id === cfg.id);
    if (!v) {
      v = makeVehicle(cfg.id, cfg.callsign, cfg.color, cfg.link, 24.787, 121.011, 0);
      state.vehicles.push(v);
      setupVehicleLayers(v);
    } else {
      v.callsign = cfg.callsign;
      v.color = cfg.color;
      v.link = cfg.link;
    }
  }
  if (!state.vehicles.some((v) => v.id === state.activeVehicleId) && state.vehicles[0]) {
    state.activeVehicleId = state.vehicles[0].id;
  }
  renderFleetChips();
  renderActiveLinkRail();
  renderLinkPath();
  renderConnectButton();
  renderFlightModeRail();
  renderCommandControls();
  applyActiveVehicleLink(true);
}

function applyFleetFrame(frame: ServerFleetFrame): void {
  const fleetWasFlying = state.flight;
  state.flight = frame.flight;
  serverSimTime = frame.t;

  for (const f of frame.vehicles) {
    const v = state.vehicles.find((x) => x.id === f.id);
    if (!v) continue;

    const wasInsActive = v.insActive;
    const wasLinkActive = v.linkActive;
    const wasFlight = v.flight;

    // Bulk copy from server frame
    v.flight = f.flight;
    v.linkActive = f.linkActive;
    v.lat = f.lat; v.lon = f.lon;
    v.altitude = f.altitude; v.speed = f.speed; v.heading = f.heading;
    v.gpsActive = f.gpsActive; v.gpsSats = f.gpsSats; v.gpsHdop = f.gpsHdop;
    v.insActive = f.insActive;
    v.mode = f.mode;
    v.safetyState = f.safetyState;
    v.preflightOk = f.preflightOk;
    v.missionUploaded = f.missionUploaded;
    v.missionCount = f.missionCount;
    v.missionActiveIndex = f.missionActiveIndex;
    v.roll = f.roll; v.pitch = f.pitch; v.yaw = f.yaw;
    v.thr = f.thr; v.vbat = f.vbat; v.armed = f.armed;
    v.gyroX = f.gyroX; v.gyroY = f.gyroY; v.gyroZ = f.gyroZ;
    v.accelX = f.accelX; v.accelY = f.accelY; v.accelZ = f.accelZ;
    v.baroAlt = f.baroAlt; v.baroVs = f.baroVs;
    v.baroP = f.baroP; v.baroT = f.baroT;
    v.batI = f.batI; v.batUsed = f.batUsed;

    // ---- Track management ----
    // Three independent polylines per vehicle:
    //   gpsTrack       — appended while linkActive && gpsActive
    //   insTrack       — appended while linkActive && !gpsActive (aircraft INS)
    //   predictedTrack — built locally by predictTick while !linkActive
    if (!v.flight) {
      if (wasFlight) {
        v.gpsTrack = [];
        v.insTrack = [];
        v.predictedTrack = [];
        v.predictionStart = null;
        if (v.gpsLine) v.gpsLine.setLatLngs([]);
        if (v.insLine) v.insLine.setLatLngs([]);
        if (v.predictedLine) v.predictedLine.setLatLngs([]);
      }
    } else if (Number.isFinite(v.lat) && Number.isFinite(v.lon)) {
      // Link-loss edge: snapshot prediction start. The frame's lat/lon
      // is already frozen on the server side at the moment of loss, so
      // it's the right anchor for ground-side dead-reckoning.
      if (wasLinkActive && !v.linkActive) {
        v.predictionStart = {
          lat: v.lat, lon: v.lon,
          heading: v.heading, speed: v.speed,
          tMs: Date.now(),
        };
        v.predictedTrack = [[v.lat, v.lon]];
        if (v.predictedLine) v.predictedLine.setLatLngs(v.predictedTrack);
      }
      // Link-resume edge: archive the prediction; live frames again.
      if (!wasLinkActive && v.linkActive) {
        v.predictionStart = null;
        v.predictedTrack = [];
        if (v.predictedLine) v.predictedLine.setLatLngs([]);
      }

      if (v.linkActive) {
        // GPS just dropped (link still up) → seed a fresh INS segment.
        if (!wasInsActive && v.insActive) {
          v.insTrack = [];
          if (v.gpsTrack.length > 0) {
            v.insTrack.push(v.gpsTrack[v.gpsTrack.length - 1]!);
          }
        }
        if (v.gpsActive) {
          v.gpsTrack.push([v.lat, v.lon]);
          if (v.gpsTrack.length > 800) v.gpsTrack.shift();
        } else {
          v.insTrack.push([v.lat, v.lon]);
          if (v.insTrack.length > 400) v.insTrack.shift();
        }
        if (v.marker) v.marker.setLatLng([v.lat, v.lon]);
        if (v.gpsLine) v.gpsLine.setLatLngs(v.gpsTrack);
        if (v.insLine) v.insLine.setLatLngs(v.insTrack);
      } else {
        // Link is down. Marker stays at the frozen position; the
        // prediction tick advances predictedLine independently.
        if (v.marker) v.marker.setLatLng([v.lat, v.lon]);
      }
    }

    refreshMarkerClass(v);
  }

  updateRangeRings();
  renderActive();
  renderFleetChips();

  // The active vehicle's flight state may have flipped this frame even if
  // the fleet aggregate didn't, so refresh the rail unconditionally —
  // it's cheap.
  renderActiveLinkRail();
  renderConnectButton();
  renderFlightModeRail();
  renderCommandControls();
  refreshTransportStatusFromActive();
  if (fleetWasFlying !== state.flight) {
    refreshLedger();
  }
}

function applyLogFromBridge(msg: ServerLogMessage): void {
  pushLog(msg.level, msg.tagKey, msg.msgKey, ...(msg.msgArgs ?? []));
}

/**
 * Ground-side dead-reckoning during link loss. Runs at 4 Hz independent
 * of incoming frames (because the whole point is that frames have stopped
 * arriving for the affected vehicle). Each tick advances the predicted
 * polyline by extrapolating from the velocity vector captured at the
 * moment of loss.
 *
 * This is intentionally simple: straight-line, no curve, no gravity, no
 * wind. The aircraft really is somewhere — we just don't know where, and
 * a clearly-marked guess is better than no information.
 */
function predictTick(): void {
  for (const v of state.vehicles) {
    if (!v.flight || v.linkActive || !v.predictionStart) continue;
    const ps = v.predictionStart;
    const elapsed = (Date.now() - ps.tMs) / 1000;          // seconds since loss
    const headRad = (ps.heading * Math.PI) / 180;
    const dlat = (ps.speed * elapsed * Math.cos(headRad)) / 111111;
    const denom = 111111 * Math.cos((ps.lat * Math.PI) / 180);
    const dlon = denom !== 0 ? (ps.speed * elapsed * Math.sin(headRad)) / denom : 0;
    const predLat = ps.lat + dlat;
    const predLon = ps.lon + dlon;
    if (!Number.isFinite(predLat) || !Number.isFinite(predLon)) continue;
    // Keep the polyline trim — append new endpoint, drop old once long.
    v.predictedTrack.push([predLat, predLon]);
    if (v.predictedTrack.length > 200) v.predictedTrack.shift();
    if (v.predictedLine) v.predictedLine.setLatLngs(v.predictedTrack);
  }
}

// ---- Render active vehicle into telemetry/sensor DOM ----

function renderActive(): void {
  const v = activeVehicle();
  if (!v) return;

  // Sidebar + plate-head coord + active callsign always reflect the
  // active vehicle, even when offline.
  setText("#sb-active-cs", v.callsign);
  setText("#plate-coord", `${v.lat.toFixed(5)}° N · ${v.lon.toFixed(5)}° E`);
  setText("#plate-coord-cb", `${v.lat.toFixed(5)}° N · ${v.lon.toFixed(5)}° E`);
  setText("#cb-cam-class", t("cam.feed", t(`cam.${state.cam}`)));

  if (!v.flight) {
    resetTelemetryDisplay();
    return;
  }

  const roll = fmtSigned(v.roll, 1, 4);
  const pitch = fmtSigned(v.pitch, 1, 4);
  const yaw = v.yaw.toFixed(1).padStart(5, "0");
  const thr = String(v.thr);
  const vbat = v.vbat.toFixed(1);
  const armedTxt = v.armed ? t("val.armed.yes") : t("val.armed.no");
  const safetyTxt =
    !v.linkActive ? t("readout.link_lost") :
    v.insActive ? t("readout.ins_active") :
    v.armed ? t("readout.armed_active") :
    t("readout.safe_disarmed");

  setText("[data-tel='roll']", roll);
  setText("[data-tel='pitch']", pitch);
  setText("[data-tel='yaw']", yaw);
  setText("[data-tel='thr']", thr);
  setText("[data-tel='vbat']", vbat);
  setText("[data-tel='armed']", armedTxt);
  // mirror to combined-view compact telemetry
  setText("[data-tel-cb='roll']", roll);
  setText("[data-tel-cb='pitch']", pitch);
  setText("[data-tel-cb='yaw']", yaw);
  setText("[data-tel-cb='thr']", thr);
  setText("[data-tel-cb='vbat']", vbat);
  setText("[data-tel-cb='armed']", armedTxt);
  $$<HTMLElement>("[data-status='armed']").forEach((el) => {
    el.textContent = safetyTxt;
    el.classList.toggle("state--ok", v.armed && v.linkActive && !v.insActive);
    el.classList.toggle("state--warn", v.safetyState === "failsafe" || (v.linkActive && v.insActive));
    el.classList.toggle("state--off", !v.linkActive);
  });

  setText("[data-sens='gyro-x']", fmtSigned(v.gyroX, 2, 5));
  setText("[data-sens='gyro-y']", fmtSigned(v.gyroY, 2, 5));
  setText("[data-sens='gyro-z']", fmtSigned(v.gyroZ, 2, 5));
  setText("[data-sens='accel-x']", fmtSigned(v.accelX, 2, 5));
  setText("[data-sens='accel-y']", fmtSigned(v.accelY, 2, 5));
  setText("[data-sens='accel-z']", fmtSigned(v.accelZ, 2, 5));

  setText("[data-sens='mag-hdg']", pad3(v.heading));
  const needle = $<HTMLElement>(".compass-needle");
  if (needle) needle.style.transform = `translate(-50%, -50%) rotate(${v.heading}deg)`;

  setText("[data-sens='baro-alt']", v.baroAlt.toFixed(1));
  setText("[data-sens='baro-vs']", fmtSigned(v.baroVs, 1, 3));
  setText("[data-sens='baro-p']", v.baroP.toFixed(1));
  setText("[data-sens='baro-t']", fmtSigned(v.baroT, 1, 4));

  const gpsState = $(".cell--gps .cell-state");
  if (gpsState) {
    gpsState.textContent = v.gpsActive ? t("state.fix_3d") : t("state.no_fix");
    gpsState.classList.toggle("state--ok", v.gpsActive);
    gpsState.classList.toggle("state--off", !v.gpsActive);
  }
  setText("[data-sens='gps-fix']", v.gpsActive ? t("gps.fix.three_d") : t("gps.fix.none"));
  setText("[data-sens='gps-sat']", `${v.gpsSats}/${v.gpsSats + (v.gpsActive ? 4 : 0)}`);
  setText("[data-sens='gps-hdop']", v.gpsActive ? v.gpsHdop.toFixed(2) : "--.--");
  setText("[data-sens='gps-lat']", v.gpsActive ? v.lat.toFixed(6) : "--.------");
  setText("[data-sens='gps-lon']", v.gpsActive ? v.lon.toFixed(6) : "--.------");
  setText("[data-sens='gps-alt']", v.gpsActive ? v.altitude.toFixed(0) : "--");

  setText("[data-sens='bat-vbat']", v.vbat.toFixed(1));
  setText("[data-sens='bat-i']", v.batI.toFixed(1));
  setText("[data-sens='bat-used']", String(Math.floor(v.batUsed)));
  setText("[data-sens='bat-est']", String(Math.max(0, Math.floor((v.vbat - 18) * 3))));
  const bar = $<HTMLElement>("[data-sens='bat-bar']");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, ((v.vbat - 18) / (25.2 - 18)) * 100))}%`;

  setText("[data-sens='rc-ail']", String(1500 + Math.floor(jitter(0, 12))));
  setText("[data-sens='rc-ele']", String(1500 + Math.floor(jitter(0, 12))));
  setText("[data-sens='rc-thr']", String(1000 + Math.floor(v.thr * 5)));
  setText("[data-sens='rc-rud']", String(1500 + Math.floor(jitter(0, 12))));
  setText("[data-sens='rc-rssi']", `${Math.floor(jitter(-58, 2))} dBm`);
  setText("[data-sens='rc-lq']", `${Math.floor(jitter(99, 0.5))} %`);
  setText("[data-sens='rc-rate']", "500 Hz");
  const rcState = $<HTMLElement>("[data-sens='rc-state']");
  if (rcState) {
    rcState.textContent = t("state.connected");
    rcState.classList.remove("state--off");
    rcState.classList.add("state--ok");
  }

  setText("[data-sens='data-transport']", state.transport.toUpperCase());
  setText("[data-sens='data-baud']", state.transport === "serial" ? "921600 / 100 Hz" : "— / 100 Hz");
  setText("[data-sens='data-latency']", `${Math.floor(jitter(2, 0.5))} ms`);
  setText("[data-sens='data-loss']", v.gpsActive ? "0.0 %" : "0.4 %");
  setText("[data-sens='data-rxtx']", `${Math.floor(serverSimTime * 100)} / ${Math.floor(serverSimTime * 12)}`);
  const dataState = $<HTMLElement>("[data-sens='data-state']");
  if (dataState) {
    dataState.textContent = t("state.connected");
    dataState.classList.remove("state--off");
    dataState.classList.add("state--ok");
  }

  const bearing = `${pad3(v.heading)}°`;
  const speedTxt = `${v.speed.toFixed(1)} m/s`;
  const altTxt = v.altitude.toFixed(0);
  setText("[data-plate='bearing']", bearing);
  setText("[data-plate='range']", speedTxt);
  setText("[data-plate='alt']", altTxt);
  setText("[data-plate='sat']", v.gpsActive ? `${v.gpsSats}/${v.gpsSats + 4}` : "0/0");
  // mirror to combined view
  setText("[data-plate-cb='bearing']", bearing);
  setText("[data-plate-cb='range']", speedTxt);
  setText("[data-plate-cb='alt']", altTxt);
  renderAltitudeProfile();
  renderTerrainRelative();
}

// Connection control is per-vehicle. The CONNECT button drives the
// currently-active vehicle only; switching the active vehicle does NOT
// change anyone's connection state. Authoritative connection state is
// owned by ground/src/bun/sim.ts.

function setVehicleConnected(id: string, on: boolean): void {
  const v = state.vehicles.find((vehicle) => vehicle.id === id);
  if (!on && v?.armed) {
    pushLog("warn", "log.tag.safe", "log.msg.disconnect_blocked_armed", v.callsign);
    renderConnectButton();
    return;
  }
  sendBridge({ type: on ? "connect" : "disconnect", id });
}

function setActiveVehicleConnected(on: boolean): void {
  const v = activeVehicle();
  if (!v) return;
  setVehicleConnected(v.id, on);
}

function sendVehicleCommand(command: VehicleCommand): void {
  const v = activeVehicle();
  if (!v) return;
  const blockedReason = commandBlockedReason(command, v);
  if (blockedReason) {
    pushLog("warn", "log.tag.cmd", "log.msg.command_rejected_reason", commandLabel(command), blockedReason);
    renderCommandControls();
    return;
  }
  if (command === "kill" && !killConfirmationPending()) {
    beginKillConfirmation(v);
    return;
  }
  clearKillConfirmation(false);
  if (sendBridge({ type: "command", id: v.id, command })) {
    pushLog("info", "log.tag.cmd", "log.msg.command_sent", commandLabel(command));
    renderCommandControls();
  }
}

function resetTelemetryDisplay(): void {
  const telemReset: Record<string, string> = {
    "[data-tel='roll']": "+0.0",
    "[data-tel='pitch']": "+0.0",
    "[data-tel='yaw']": "000.0",
    "[data-tel='thr']": "0",
    "[data-tel='vbat']": "--.-",
    "[data-tel='armed']": t("val.armed.no"),
    "[data-tel-cb='armed']": t("val.armed.no"),
    "[data-sens='gyro-x']": "+0.00",
    "[data-sens='gyro-y']": "+0.00",
    "[data-sens='gyro-z']": "+0.00",
    "[data-sens='accel-x']": "+0.00",
    "[data-sens='accel-y']": "+0.00",
    "[data-sens='accel-z']": "+1.00",
    "[data-sens='mag-hdg']": "000",
    "[data-sens='baro-alt']": "000.0",
    "[data-sens='baro-vs']": "+0.0",
    "[data-sens='baro-p']": "1013.2",
    "[data-sens='baro-t']": "+24.5",
    "[data-sens='gps-fix']": t("gps.fix.none"),
    "[data-sens='gps-sat']": "0/0",
    "[data-sens='gps-hdop']": "--.--",
    "[data-sens='gps-lat']": "--.------",
    "[data-sens='gps-lon']": "--.------",
    "[data-sens='gps-alt']": "--",
    "[data-sens='bat-vbat']": "--.-",
    "[data-sens='bat-i']": "--.-",
    "[data-sens='bat-used']": "----",
    "[data-sens='bat-est']": "--",
    "[data-sens='rc-ail']": "1500",
    "[data-sens='rc-ele']": "1500",
    "[data-sens='rc-thr']": "1000",
    "[data-sens='rc-rud']": "1500",
    "[data-sens='rc-rssi']": "-- dBm",
    "[data-sens='rc-lq']": "-- %",
    "[data-sens='rc-rate']": "-- Hz",
    "[data-sens='data-transport']": "—",
    "[data-sens='data-baud']": "—",
    "[data-sens='data-latency']": "— ms",
    "[data-sens='data-loss']": "— %",
    "[data-sens='data-rxtx']": "0 / 0",
    "[data-plate='bearing']": "—",
    "[data-plate='range']": "—",
    "[data-plate='alt']": "—",
    "[data-plate='sat']": "0/0",
  };
  Object.entries(telemReset).forEach(([sel, v]) => setText(sel, v));

  const bar = $<HTMLElement>("[data-sens='bat-bar']");
  if (bar) bar.style.width = "0%";

  // reset GPS state cell
  const gpsState = $(".cell--gps .cell-state");
  if (gpsState) {
    gpsState.textContent = t("state.no_fix");
    gpsState.classList.remove("state--ok");
    gpsState.classList.add("state--off");
  }
  const rcState = $<HTMLElement>("[data-sens='rc-state']");
  if (rcState) {
    rcState.textContent = t("state.no_signal");
    rcState.classList.remove("state--ok");
    rcState.classList.add("state--off");
  }
  const dataState = $<HTMLElement>("[data-sens='data-state']");
  if (dataState) {
    dataState.textContent = t("state.disconnected");
    dataState.classList.remove("state--ok");
    dataState.classList.add("state--off");
  }
  const tag = $(".reticle-tag");
  if (tag) tag.textContent = t("reticle.tag.pend");

  const needle = $<HTMLElement>(".compass-needle");
  if (needle) needle.style.transform = "translate(-50%, -50%) rotate(0deg)";

  $$<HTMLElement>("[data-status='armed']").forEach((el) => {
    el.textContent = t("readout.safe_disarmed");
    el.classList.remove("state--ok", "state--warn", "state--off");
  });
  renderAltitudeProfile();
  renderTerrainRelative();
}

// ---------- 8. Connect / disconnect ----------

function renderLinkPath(): void {
  const v = activeVehicle();
  const valEl = $<HTMLElement>("[data-rail='linkpath'] .rail-val-text");
  const dotWrap = $<HTMLElement>("[data-rail='linkpath'] .rail-val");
  const footEl = $<HTMLElement>("[data-rail='linkpath'] .rail-foot");
  if (valEl) valEl.textContent = v.link.mode === "via-mission" ? t("linkpath.via_mission") : t("linkpath.direct");
  if (dotWrap) dotWrap.dataset["state"] = v.link.mode === "via-mission" ? "via" : "direct";
  if (footEl) footEl.textContent = `${v.link.transport.toUpperCase()} · ${v.link.endpoint}`;
}

function renderConnectButton(): void {
  const v = activeVehicle();
  const connectBtn = $<HTMLButtonElement>("[data-action='connect-flight']");
  if (!connectBtn) return;
  const label = connectBtn.querySelector<HTMLElement>(".op-btn-label");
  const meta = connectBtn.querySelector<HTMLElement>(".op-btn-meta");
  const disconnectLocked = v.flight && v.armed;
  connectBtn.disabled = disconnectLocked;
  if (label) {
    label.textContent =
      disconnectLocked ? t("btn.disconnect_locked") :
      v.flight ? t("btn.disconnect_flight") :
      t("btn.connect_flight");
  }
  const metaTxt = v.link.mode === "via-mission" ? t("linkpath.via_mission") : t("linkpath.direct");
  if (meta) {
    meta.textContent =
      disconnectLocked ? t("btn.disconnect_locked.meta") :
      v.flight ? t("btn.disconnect_flight.meta") :
      metaTxt;
  }
}

function renderFlightModeRail(): void {
  const v = activeVehicle();
  const valEl = $<HTMLElement>("[data-rail='mode'] .rail-val-text");
  const dotWrap = $<HTMLElement>("[data-rail='mode'] .rail-val");
  const footEl = $<HTMLElement>("[data-rail='mode'] .rail-foot");
  if (valEl) valEl.textContent = t(`mode.${v.mode}`);
  if (dotWrap) dotWrap.dataset["state"] =
    v.safetyState === "failsafe" ? "warn" :
    v.armed ? "ok" :
    v.preflightOk ? "direct" :
    "offline";
  if (footEl) {
    const uploaded = v.missionUploaded ? t("mission.uploaded", v.missionCount) : t("rail.mode.foot");
    footEl.textContent = `${t(`safety.${v.safetyState}`)} · ${uploaded}`;
  }
}

let killConfirmUntil = 0;
let killConfirmTimer: ReturnType<typeof setTimeout> | null = null;

function commandLabel(command: VehicleCommand): string {
  return t(COMMAND_LABEL_KEYS[command]);
}

function commandMeta(command: VehicleCommand): string {
  return t(COMMAND_META_KEYS[command]);
}

function killConfirmationPending(): boolean {
  return Date.now() < killConfirmUntil;
}

function clearKillConfirmation(render = true): void {
  killConfirmUntil = 0;
  if (killConfirmTimer) {
    clearTimeout(killConfirmTimer);
    killConfirmTimer = null;
  }
  if (render) renderCommandControls();
}

function beginKillConfirmation(v: Vehicle): void {
  killConfirmUntil = Date.now() + KILL_CONFIRM_MS;
  if (killConfirmTimer) clearTimeout(killConfirmTimer);
  killConfirmTimer = setTimeout(() => clearKillConfirmation(), KILL_CONFIRM_MS);
  pushLog("warn", "log.tag.safe", "log.msg.kill_confirm", v.callsign);
  renderCommandControls();
}

function commandBlockedReason(command: VehicleCommand, v: Vehicle): string | null {
  if (!v.flight) return t("cmd.reason.offline");
  if (!v.linkActive) return t("cmd.reason.link_lost");
  if (command === "arm") {
    if (v.armed) return t("cmd.reason.already_armed");
    if (!v.preflightOk) return t("cmd.reason.preflight");
    return null;
  }
  if (!v.armed) return t("cmd.reason.disarmed");
  if (command === "mission") {
    const validation = validateMissionPlan();
    if (validation) return validation;
    if (missionPlanDirty) return t("cmd.reason.plan_dirty");
    if (!v.missionUploaded || v.missionCount <= 0) return t("cmd.reason.no_upload");
  }
  return null;
}

function renderCommandControls(): void {
  const v = activeVehicle();
  const stateEl = $<HTMLElement>("[data-command-state]");
  if (stateEl) {
    stateEl.textContent = t(`safety.${v.safetyState}`);
    stateEl.classList.toggle("state--ok", v.armed || (v.flight && v.preflightOk));
    stateEl.classList.toggle("state--warn", v.safetyState === "failsafe" || (!v.preflightOk && v.flight));
    stateEl.classList.toggle("state--off", !v.flight);
  }

  $$<HTMLButtonElement>("[data-command]").forEach((btn) => {
    const command = btn.dataset["command"] as VehicleCommand | undefined;
    if (!command) return;
    const blockedReason = commandBlockedReason(command, v);
    const enabled = blockedReason === null;
    const confirming = command === "kill" && enabled && killConfirmationPending();
    btn.disabled = !enabled;
    const active =
      (command === "hold" && v.mode === "hold") ||
      (command === "mission" && v.mode === "mission") ||
      (command === "rtl" && v.mode === "rtl") ||
      (command === "land" && v.mode === "land") ||
      (command === "arm" && v.armed);
    const label = btn.querySelector<HTMLElement>(".op-btn-label");
    const meta = btn.querySelector<HTMLElement>(".op-btn-meta");
    const labelText = confirming ? t("btn.kill.confirm") : commandLabel(command);
    const metaText = blockedReason ?? (confirming ? t("btn.kill.confirm.meta") : commandMeta(command));
    const shortcut = COMMAND_SHORTCUTS[command];
    const title = blockedReason
      ? `${labelText} · ${blockedReason}`
      : `${labelText} · ${t("cmd.shortcut", shortcut)}`;
    if (label) label.textContent = labelText;
    if (meta) meta.textContent = metaText;
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("is-confirming", confirming);
    btn.classList.toggle("is-blocked", Boolean(blockedReason));
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.setAttribute("aria-label", title);
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    btn.title = title;
  });
}

function renderActiveLinkRail(): void {
  const v = activeVehicle();
  const valEl = $<HTMLElement>("[data-rail='flight'] .rail-val-text");
  const dotWrap = $<HTMLElement>("[data-rail='flight'] .rail-val");
  const footEl = $<HTMLElement>("[data-rail='flight'] .rail-foot");
  if (valEl) valEl.textContent = v.flight ? t("val.online") : t("val.offline");
  if (dotWrap) dotWrap.dataset["state"] = v.flight ? "ok" : "offline";
  if (footEl) {
    if (!v.flight) footEl.textContent = t("rail.flight.foot");
    else if (v.link.mode === "via-mission") footEl.textContent = t("rail.flight.foot.via_mission");
    else footEl.textContent = t("rail.flight.foot.connected");
  }
}

function refreshTransportStatusFromActive(): void {
  const transportStatus = $<HTMLElement>("[data-status='transport']");
  if (!transportStatus) return;
  const v = activeVehicle();
  const on = v?.flight ?? false;
  transportStatus.textContent = on ? t("state.connected") : t("settings.applied");
  transportStatus.classList.toggle("state--ok", on);
  transportStatus.classList.toggle("state--warn", !on);
  transportStatus.classList.toggle("state--off", false);
  const disconnect = $<HTMLButtonElement>("[data-action='settings-disconnect']");
  if (disconnect) disconnect.disabled = Boolean(v?.armed);
}

function refreshLedger(): void {
  const tag = $<HTMLElement>(".ledger-tag");
  const mid = $<HTMLElement>(".ledger-mid");
  if (tag) tag.textContent = state.flight ? t("ledger.tag.demo") : t("ledger.tag");
  if (mid) {
    if (state.flight) mid.textContent = t("ledger.connected.demo");
    else mid.textContent = t("ledger.idle");
  }
}

// ---------- 9. Log ----------

const seedLogs: LogEntry[] = [
  { ts: "01:54:07", tag: "log.tag.sys", level: "info", msgKey: "log.msg.boot" },
  { ts: "01:54:08", tag: "log.tag.view", level: "info", msgKey: "log.msg.view_loaded" },
  { ts: "01:54:08", tag: "log.tag.link", level: "info", msgKey: "log.msg.awaiting" },
  { ts: "01:54:09", tag: "log.tag.safe", level: "warn", msgKey: "log.msg.prearm" },
  { ts: "01:54:10", tag: "log.tag.model", level: "info", msgKey: "log.msg.model" },
  { ts: "01:54:12", tag: "log.tag.map", level: "info", msgKey: "log.msg.map_origin" },
  { ts: "01:54:14", tag: "log.tag.link", level: "err", msgKey: "log.msg.no_fc" },
  { ts: "01:54:18", tag: "log.tag.ui", level: "info", msgKey: "log.msg.ready" },
];

const logBuffer: LogEntry[] = [...seedLogs];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function nowTs(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function pushLog(level: LogLevel, tagKey: string, msgKey: string, ...args: (string | number)[]): void {
  logBuffer.push({ ts: nowTs(), tag: tagKey, level, msgKey, msgArgs: args });
  if (logBuffer.length > LOG_LIMIT) logBuffer.splice(0, logBuffer.length - LOG_LIMIT);
  renderLog();
}

function renderLog(): void {
  const list = $<HTMLOListElement>(".log-list");
  if (!list) return;
  const search = state.search.trim().toLowerCase();

  const rows = logBuffer.filter((e) => {
    if (state.filter !== "all" && e.level !== state.filter) return false;
    if (search) {
      const text = (t(e.tag) + " " + t(e.msgKey, ...(e.msgArgs ?? []))).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  list.innerHTML = "";
  for (const e of rows) {
    const li = document.createElement("li");
    li.className = `log-row log-row--${e.level === "err" ? "err" : e.level === "warn" ? "warn" : "info"}`;
    li.innerHTML = `
      <span class="log-ts">${e.ts}</span>
      <span class="log-tag">${escapeHtml(t(e.tag))}</span>
      <span class="log-msg">${escapeHtml(t(e.msgKey, ...(e.msgArgs ?? [])))}</span>
    `;
    list.appendChild(li);
  }

  const meta = $<HTMLElement>(".search-meta");
  if (meta) meta.textContent = t("log.count", rows.length, logBuffer.length);

  list.scrollTop = list.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function setLogFilter(f: LogFilter): void {
  state.filter = f;
  $$<HTMLButtonElement>(".chip[data-filter]").forEach((c) => {
    c.classList.toggle("is-active", c.dataset["filter"] === f);
  });
  renderLog();
}

// ---------- 10. Calibration ----------

function setCalStep(step: number): void {
  if (step < 1 || step > 4) return;
  state.calStep = step;
  $$<HTMLButtonElement>(".cal-step[data-cal-step]").forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset["calStep"]) === step);
  });
  renderCalPrompt();
}

function renderCalPrompt(): void {
  const step = state.calStep;
  const labelKey = `cal.step${step}`;
  const cls = $<HTMLElement>(".cal-prompt-class");
  const title = $<HTMLElement>(".cal-prompt-title");
  const body = $<HTMLElement>(".cal-prompt-body");
  const captureLabel = $<HTMLElement>("[data-action='cal-capture'] .op-btn-label");
  if (cls) cls.textContent = t("cal.prompt.class", step.toString().padStart(2, "0"), t(labelKey));
  if (title) title.textContent = t(`cal.prompt.title.${step}`);
  if (body) body.textContent = t(`cal.prompt.body.${step}`);
  if (captureLabel) {
    const cur = state.calCaptured[step] ?? 0;
    const max = state.calMaxCaptures[step] ?? 1;
    captureLabel.textContent = max > 1 ? t("cal.capture", cur + 1, max) : t("cal.start", t(labelKey));
  }
  renderCalProgress();
}

function renderCalProgress(): void {
  let done = 0;
  for (let i = 1; i <= 4; i++) {
    if ((state.calCaptured[i] ?? 0) >= (state.calMaxCaptures[i] ?? 1)) done++;
  }
  const bar = $<HTMLElement>(".cal-progress-fill");
  if (bar) bar.style.width = `${(done / 4) * 100}%`;
  const val = $<HTMLElement>(".cal-progress-val");
  if (val) val.textContent = t("cal.steps_count", done, 4);

  $$<HTMLElement>(".cal-step[data-cal-step] .cal-state").forEach((el) => {
    const stepNum = Number((el.closest(".cal-step") as HTMLElement | null)?.dataset["calStep"] ?? 0);
    const cap = state.calCaptured[stepNum] ?? 0;
    const max = state.calMaxCaptures[stepNum] ?? 1;
    el.classList.remove("state--ok", "state--warn", "state--off");
    if (cap >= max) {
      el.classList.add("state--ok");
      el.textContent = t("cal.state.done");
    } else if (cap > 0) {
      el.classList.add("state--warn");
      el.textContent = t("cal.state.in_progress");
    } else {
      el.classList.add("state--warn");
      el.textContent = t("cal.state.pending");
    }
  });
}

function calCapture(): void {
  const step = state.calStep;
  const cap = state.calCaptured[step] ?? 0;
  const max = state.calMaxCaptures[step] ?? 1;
  if (cap >= max) {
    // already done — advance
    if (step < 4) setCalStep(step + 1);
    return;
  }
  state.calCaptured[step] = cap + 1;
  sendBridge({
    type: "calibration",
    id: activeVehicle().id,
    step,
    capture: cap + 1,
    done: state.calCaptured[step] >= max,
  });
  if (state.calCaptured[step] >= max && step < 4) {
    setCalStep(step + 1);
  } else {
    renderCalPrompt();
  }
}

// ---------- 11. Mission ----------

interface Waypoint {
  type: WaypointType;
  lat: number;
  lon: number;
  alt: number;
}

const waypoints: Waypoint[] = [
  { type: "wp.takeoff", lat: 24.7867, lon: 121.0089, alt: 5 },
  { type: "wp.waypt",   lat: 24.7902, lon: 121.0153, alt: 30 },
  { type: "wp.land",    lat: 24.7918, lon: 121.0201, alt: 0 },
];

let missionPlanDirty = true;

const missionBounds = {
  latMin: 24.7825,
  latMax: 24.7930,
  lonMin: 121.0040,
  lonMax: 121.0215,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function waypointToServer(wp: Waypoint): ServerMissionWaypoint {
  return {
    type: wp.type === "wp.takeoff" ? "takeoff" : wp.type === "wp.land" ? "land" : "waypoint",
    lat: wp.lat,
    lon: wp.lon,
    alt: wp.alt,
  };
}

function waypointToPlate(wp: Waypoint): { x: number; y: number } {
  const x = ((wp.lon - missionBounds.lonMin) / (missionBounds.lonMax - missionBounds.lonMin)) * 100;
  const y = 100 - ((wp.lat - missionBounds.latMin) / (missionBounds.latMax - missionBounds.latMin)) * 100;
  return { x: clamp(x, 8, 92), y: clamp(y, 8, 92) };
}

function waypointFromPlate(xPct: number, yPct: number): Waypoint {
  const lon = missionBounds.lonMin + (clamp(xPct, 0, 100) / 100) * (missionBounds.lonMax - missionBounds.lonMin);
  const lat = missionBounds.latMin + ((100 - clamp(yPct, 0, 100)) / 100) * (missionBounds.latMax - missionBounds.latMin);
  return { type: "wp.waypt", lat, lon, alt: 30 };
}

function haversineMeters(a: Waypoint, b: Waypoint): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function missionDistanceMeters(): number {
  let d = 0;
  for (let i = 1; i < waypoints.length; i++) d += haversineMeters(waypoints[i - 1]!, waypoints[i]!);
  return d;
}

function validateMissionPlan(): string | null {
  if (waypoints.length < 2) return t("mission.invalid.empty");
  if (waypoints.length > MISSION_MAX_WAYPOINTS) return t("mission.invalid.too_many", MISSION_MAX_WAYPOINTS);
  if (!waypoints.some((wp) => wp.type === "wp.takeoff") || !waypoints.some((wp) => wp.type === "wp.land")) {
    return t("mission.invalid.endpoints");
  }
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]!;
    const idx = i + 1;
    if (!Number.isFinite(wp.lat) || !Number.isFinite(wp.lon) || wp.lat < -90 || wp.lat > 90 || wp.lon < -180 || wp.lon > 180) {
      return t("mission.invalid.coord", idx);
    }
    if (!Number.isFinite(wp.alt) || wp.alt < 0 || wp.alt > 500) {
      return t("mission.invalid.alt", idx);
    }
    if (wp.type !== "wp.land" && wp.alt < 5) {
      return t("mission.invalid.low_alt", idx);
    }
  }
  if (missionDistanceMeters() > MISSION_MAX_DISTANCE_M) {
    return t("mission.invalid.distance", (MISSION_MAX_DISTANCE_M / 1000).toFixed(0));
  }
  return null;
}

function missionCumulativeMeters(): number[] {
  const distances: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    distances.push((distances[i - 1] ?? 0) + haversineMeters(waypoints[i - 1]!, waypoints[i]!));
  }
  return distances;
}

function terrainMsl(lat: number, lon: number): number {
  // Temporary local terrain estimate until real DEM tiles are wired in.
  const ridge = Math.sin((lat - 24.782) * 820) * 11;
  const valley = Math.cos((lon - 121.004) * 760) * 8;
  const slope = (lat - 24.786) * 900;
  return Math.max(12, 54 + ridge + valley + slope);
}

function bearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const phi1 = (from.lat * Math.PI) / 180;
  const phi2 = (to.lat * Math.PI) / 180;
  const lambda1 = (from.lon * Math.PI) / 180;
  const lambda2 = (to.lon * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function offsetLatLon(lat: number, lon: number, northMeters: number, eastMeters: number): { lat: number; lon: number } {
  return {
    lat: lat + northMeters / 111111,
    lon: lon + eastMeters / (111111 * Math.cos((lat * Math.PI) / 180)),
  };
}

function currentRouteDistanceMeters(v: Vehicle): number {
  const cumulative = missionCumulativeMeters();
  if (waypoints.length < 2) return 0;

  const refLat = v.lat;
  const cosRef = Math.cos((refLat * Math.PI) / 180);
  const toXY = (p: { lat: number; lon: number }) => ({
    x: (p.lon - v.lon) * 111111 * cosRef,
    y: (p.lat - v.lat) * 111111,
  });
  let bestDistance = 0;
  let bestError = Number.POSITIVE_INFINITY;
  for (let i = 1; i < waypoints.length; i++) {
    const a = toXY(waypoints[i - 1]!);
    const b = toXY(waypoints[i]!);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby;
    if (ab2 <= 0) continue;
    const tProj = clamp(((-a.x * abx) + (-a.y * aby)) / ab2, 0, 1);
    const px = a.x + abx * tProj;
    const py = a.y + aby * tProj;
    const err = px * px + py * py;
    if (err < bestError) {
      bestError = err;
      const segmentMeters = haversineMeters(waypoints[i - 1]!, waypoints[i]!);
      bestDistance = (cumulative[i - 1] ?? 0) + segmentMeters * tProj;
    }
  }
  return bestDistance;
}

function renderAltitudeProfile(): void {
  const v = activeVehicle();
  const plan = document.querySelector<SVGPolylineElement>("[data-profile-plan]");
  const terrain = document.querySelector<SVGPolygonElement>("[data-profile-terrain]");
  const current = document.querySelector<SVGCircleElement>("[data-profile-current]");
  if (!plan || !terrain || !current) return;

  if (waypoints.length === 0) {
    plan.setAttribute("points", "");
    terrain.setAttribute("points", "0,100 100,100");
    current.setAttribute("cx", "0");
    current.setAttribute("cy", "95");
    setText("[data-profile='dist']", "0.00 km");
    setText("[data-profile='alt-min']", "—");
    setText("[data-profile='alt-max']", "—");
    setText("[data-profile='clearance']", "—");
    return;
  }

  const cumulative = missionCumulativeMeters();
  const total = Math.max(1, cumulative[cumulative.length - 1] ?? 1);
  const terrainElev = waypoints.map((wp) => terrainMsl(wp.lat, wp.lon));
  const planElev = waypoints.map((wp, i) => terrainElev[i]! + wp.alt);
  const liveTerrain = terrainMsl(v.lat, v.lon);
  const liveElev = liveTerrain + v.altitude;
  const minElev = Math.min(...terrainElev, liveTerrain) - 8;
  const maxElev = Math.max(...planElev, liveElev) + 12;
  const span = Math.max(1, maxElev - minElev);
  const xAt = (i: number) => ((cumulative[i] ?? 0) / total) * 100;
  const yAt = (elev: number) => clamp(92 - ((elev - minElev) / span) * 78, 8, 92);

  const terrainPoints = terrainElev.map((elev, i) => `${xAt(i).toFixed(1)},${yAt(elev).toFixed(1)}`).join(" ");
  const planPoints = planElev.map((elev, i) => `${xAt(i).toFixed(1)},${yAt(elev).toFixed(1)}`).join(" ");
  const liveX = clamp((currentRouteDistanceMeters(v) / total) * 100, 0, 100);

  terrain.setAttribute("points", `0,100 ${terrainPoints} 100,100`);
  plan.setAttribute("points", planPoints);
  current.setAttribute("cx", liveX.toFixed(1));
  current.setAttribute("cy", yAt(liveElev).toFixed(1));

  setText("[data-profile='dist']", `${(total / 1000).toFixed(2)} km`);
  setText("[data-profile='alt-min']", `${Math.round(Math.min(...planElev))} m`);
  setText("[data-profile='alt-max']", `${Math.round(Math.max(...planElev))} m`);
  setText("[data-profile='clearance']", v.flight ? `${Math.round(v.altitude)} m` : "—");
}

function renderTerrainRelative(): void {
  const v = activeVehicle();
  const ground = terrainMsl(v.lat, v.lon);
  const msl = ground + (v.flight ? v.altitude : 0);
  const activeIndex = v.missionActiveIndex ?? 0;
  const targetIndex = waypoints.length > 1
    ? Math.min(activeIndex + 1, waypoints.length - 1)
    : 0;
  const target = waypoints[targetIndex];
  const bearing = target ? bearingDeg(v, target) : v.heading;
  const rad = (bearing * Math.PI) / 180;
  const samples = Array.from({ length: 17 }, (_, i) => -240 + i * 30);
  const elevations = samples.map((meters) => {
    const p = offsetLatLon(
      v.lat,
      v.lon,
      Math.cos(rad) * meters,
      Math.sin(rad) * meters,
    );
    return terrainMsl(p.lat, p.lon);
  });
  const minElev = Math.min(...elevations, ground) - 8;
  const maxElev = Math.max(...elevations, msl) + 16;
  const span = Math.max(1, maxElev - minElev);
  const yAt = (elev: number) => clamp(92 - ((elev - minElev) / span) * 78, 8, 92);
  const terrainPoints = elevations.map((elev, i) => {
    const x = (i / (elevations.length - 1)) * 100;
    return `${x.toFixed(1)},${yAt(elev).toFixed(1)}`;
  }).join(" ");
  const groundY = yAt(ground);
  const dotY = yAt(msl);
  const terrainPath = document.querySelector<SVGPathElement>("[data-terrain-cross-section]");
  const line = document.querySelector<SVGLineElement>("[data-terrain-bearing-line]");
  const altitudeLine = document.querySelector<SVGLineElement>("[data-terrain-altitude-line]");
  const groundDot = document.querySelector<SVGCircleElement>("[data-terrain-ground-dot]");
  const ring = document.querySelector<SVGCircleElement>("[data-terrain-ring]");
  const dot = document.querySelector<SVGCircleElement>("[data-terrain-dot]");
  if (terrainPath) terrainPath.setAttribute("d", `M0,100 L${terrainPoints} L100,100 Z`);
  if (line) {
    line.setAttribute("x1", "50");
    line.setAttribute("y1", dotY.toFixed(1));
    line.setAttribute("x2", "92");
    line.setAttribute("y2", dotY.toFixed(1));
  }
  if (altitudeLine) {
    altitudeLine.setAttribute("x1", "50");
    altitudeLine.setAttribute("x2", "50");
    altitudeLine.setAttribute("y1", dotY.toFixed(1));
    altitudeLine.setAttribute("y2", groundY.toFixed(1));
  }
  if (groundDot) groundDot.setAttribute("cy", groundY.toFixed(1));
  if (ring) {
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", dotY.toFixed(1));
  }
  if (dot) {
    dot.setAttribute("cx", "50");
    dot.setAttribute("cy", dotY.toFixed(1));
  }
  setText("[data-terrain='msl']", v.flight ? `${Math.round(msl)} m` : "—");
  setText("[data-terrain='agl']", v.flight ? `${Math.round(v.altitude)} m` : "—");
  setText("[data-terrain='ground']", `${Math.round(ground)} m`);
  setText("[data-terrain='bearing']", target ? `${pad3(bearing)}°` : "—");
}

function markMissionDirty(): void {
  missionPlanDirty = true;
  renderCommandControls();
}

function renderMissionSummary(): void {
  const validation = validateMissionPlan();
  const summary = $<HTMLElement>("[data-mission='summary']");
  if (summary) {
    summary.textContent = validation ? t("mission.summary.invalid", waypoints.length) : t("mission.summary", waypoints.length, 0);
    summary.title = validation ?? summary.textContent ?? "";
    summary.classList.toggle("state--warn", Boolean(validation));
  }
  const planned = $<HTMLElement>("[data-mission='planned']");
  if (planned) planned.textContent = t("mission.planned", waypoints.length);
}

function renderWaypointTable(): void {
  const tbody = $<HTMLTableSectionElement>(".wp-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const activeMissionIndex = activeVehicle().missionActiveIndex;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]!;
    const tr = document.createElement("tr");
    tr.dataset["wpIndex"] = String(i);
    tr.classList.toggle("is-active", activeMissionIndex === i);
    const typeOptions = (["wp.takeoff", "wp.waypt", "wp.land"] as WaypointType[]).map((type) => `
          <button class="wp-type-btn ${type === wp.type ? "is-active" : ""}" type="button" data-wp-type="${type}">
            ${escapeHtml(t(type))}
          </button>
        `).join("");
    tr.innerHTML = `
      <td class="wp-idx">${(i + 1).toString().padStart(2, "0")}</td>
      <td class="wp-type-cell">
        <div class="wp-type-toggle" role="group" aria-label="Waypoint type">
          ${typeOptions}
        </div>
      </td>
      <td><input class="wp-field" data-wp-field="lat" type="number" step="0.000001" value="${wp.lat.toFixed(6)}"></td>
      <td><input class="wp-field" data-wp-field="lon" type="number" step="0.000001" value="${wp.lon.toFixed(6)}"></td>
      <td class="wp-alt-cell"><div class="wp-alt-wrap"><input class="wp-field wp-field--alt" data-wp-field="alt" type="number" step="1" min="0" value="${wp.alt}"><span class="wp-unit">m</span></div></td>
      <td class="wp-action-cell"><button class="wp-delete" type="button" data-wp-delete="${i}" aria-label="Delete waypoint">×</button></td>
    `;
    tbody.appendChild(tr);
  }
  renderMissionSummary();
  renderMissionPlate();
  renderAltitudeProfile();
  renderTerrainRelative();
}

function newWaypoint(): void {
  const landAtEnd = waypoints[waypoints.length - 1]?.type === "wp.land";
  const insertAt = landAtEnd ? Math.max(0, waypoints.length - 1) : waypoints.length;
  const last = waypoints[insertAt - 1] ?? waypoints[waypoints.length - 1] ?? activeVehicle();
  const lat = "lat" in last ? last.lat + 0.001 : 24.7867;
  const lon = "lon" in last ? last.lon + 0.001 : 121.0089;
  waypoints.splice(insertAt, 0, { type: "wp.waypt", lat, lon, alt: 30 });
  markMissionDirty();
  renderWaypointTable();
  pushLog("info", "log.tag.model", "log.msg.plan_new", insertAt + 1);
}

function clearWaypoints(): void {
  waypoints.length = 0;
  markMissionDirty();
  renderWaypointTable();
  pushLog("warn", "log.tag.model", "log.msg.plan_clear");
}

function uploadPlan(): void {
  const v = activeVehicle();
  const validation = validateMissionPlan();
  if (validation) {
    pushLog("warn", "log.tag.cmd", "log.msg.plan_invalid", validation);
    renderMissionSummary();
    renderCommandControls();
    return;
  }
  if (sendBridge({ type: "uploadPlan", id: v.id, waypoints: waypoints.map(waypointToServer) })) {
    missionPlanDirty = false;
    renderCommandControls();
  }
}

function downloadPlan(): void {
  const payload = {
    vehicle: activeVehicle().callsign,
    generatedAt: new Date().toISOString(),
    waypoints: waypoints.map(waypointToServer),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `airyn-plan-${activeVehicle().callsign.toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  pushLog("info", "log.tag.model", "log.msg.plan_download", waypoints.length);
}

function renderMissionPlate(): void {
  const points = waypoints.map(waypointToPlate);
  const activeMissionIndex = activeVehicle().missionActiveIndex;
  const path = document.querySelector<SVGPolylineElement>("[data-mission-path]");
  if (path) path.setAttribute("points", points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));

  const plate = $<HTMLElement>(".plate--mission");
  if (plate) {
    plate.querySelectorAll(".wp").forEach((el) => el.remove());
    points.forEach((p, i) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "wp";
      marker.classList.toggle("is-active", activeMissionIndex === i);
      marker.dataset["wpIndex"] = String(i);
      marker.style.left = `${p.x}%`;
      marker.style.top = `${p.y}%`;
      marker.innerHTML = `<em>${(i + 1).toString().padStart(2, "0")}</em>`;
      plate.appendChild(marker);
    });
  }

  const distance = missionDistanceMeters();
  const alts = waypoints.map((wp) => wp.alt);
  setText("[data-mission='dist']", `${(distance / 1000).toFixed(2)} km`);
  setText("[data-mission='eta']", waypoints.length > 1 ? `${Math.max(1, Math.ceil(distance / 8 / 60))} min` : "—");
  setText("[data-mission='alt-min']", alts.length ? `${Math.min(...alts)} m` : "—");
  setText("[data-mission='alt-max']", alts.length ? `${Math.max(...alts)} m` : "—");
  renderMissionSummary();
  renderAltitudeProfile();
  renderTerrainRelative();
  scheduleOperationalMapFit();
}

function renderMissionActiveState(): void {
  const activeMissionIndex = activeVehicle().missionActiveIndex;
  $$<HTMLElement>("[data-wp-index]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset["wpIndex"] === String(activeMissionIndex));
  });
}

function handleWaypointTableInput(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const row = target.closest<HTMLTableRowElement>("tr[data-wp-index]");
  const field = target.dataset["wpField"];
  if (!row || !field) return;
  const index = Number(row.dataset["wpIndex"]);
  const wp = waypoints[index];
  if (!wp) return;

  if (field === "type") {
    wp.type = target.value as WaypointType;
  } else {
    const parsed = Number(target.value);
    if (!Number.isFinite(parsed)) return;
    if (field === "lat") wp.lat = clamp(parsed, -90, 90);
    if (field === "lon") wp.lon = clamp(parsed, -180, 180);
    if (field === "alt") wp.alt = clamp(Math.round(parsed), 0, 500);
    if (target instanceof HTMLInputElement) {
      if (field === "lat") target.value = wp.lat.toFixed(6);
      if (field === "lon") target.value = wp.lon.toFixed(6);
      if (field === "alt") target.value = String(wp.alt);
    }
  }
  markMissionDirty();
  renderMissionSummary();
  renderMissionPlate();
  pushLog("info", "log.tag.model", "log.msg.plan_update", index + 1);
}

function handleWaypointTypeClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const btn = target.closest<HTMLButtonElement>("[data-wp-type]");
  if (!btn) return false;
  const row = btn.closest<HTMLTableRowElement>("tr[data-wp-index]");
  const type = btn.dataset["wpType"] as WaypointType | undefined;
  if (!row || !type) return false;
  const index = Number(row.dataset["wpIndex"]);
  const wp = waypoints[index];
  if (!wp || wp.type === type) return true;
  wp.type = type;
  markMissionDirty();
  renderWaypointTable();
  pushLog("info", "log.tag.model", "log.msg.plan_update", index + 1);
  return true;
}

function handleWaypointDelete(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest<HTMLButtonElement>("[data-wp-delete]");
  if (!btn) return;
  const index = Number(btn.dataset["wpDelete"]);
  if (!Number.isInteger(index) || !waypoints[index]) return;
  waypoints.splice(index, 1);
  markMissionDirty();
  renderWaypointTable();
  pushLog("warn", "log.tag.model", "log.msg.plan_delete", index + 1);
}

function addWaypointFromMissionPlate(ev: MouseEvent): void {
  if (ev.target instanceof HTMLElement && ev.target.closest(".wp")) return;
  const plate = $<HTMLElement>(".plate--mission");
  if (!plate) return;
  const rect = plate.getBoundingClientRect();
  const xPct = ((ev.clientX - rect.left) / rect.width) * 100;
  const yPct = ((ev.clientY - rect.top) / rect.height) * 100;
  const landAtEnd = waypoints[waypoints.length - 1]?.type === "wp.land";
  const insertAt = landAtEnd ? Math.max(0, waypoints.length - 1) : waypoints.length;
  waypoints.splice(insertAt, 0, waypointFromPlate(xPct, yPct));
  markMissionDirty();
  renderWaypointTable();
  pushLog("info", "log.tag.model", "log.msg.plan_new", insertAt + 1);
}

// ---------- 12. Settings + lang ----------

function transportFromLink(link: VehicleLink): Transport {
  if (link.mode === "via-mission") return "mission";
  return link.transport === "udp" ? "udp" : "serial";
}

function settingsFromLink(link: VehicleLink): Partial<AppSettings> {
  if (link.mode === "via-mission") {
    return { missionHost: link.endpoint };
  }
  if (link.transport === "udp") {
    const [host, port] = link.endpoint.split(":");
    return {
      udpHost: host || state.settings.udpHost,
      udpPort: port || state.settings.udpPort,
    };
  }
  const [port, baud] = link.endpoint.split("@").map((part) => part.trim());
  return {
    serialPort: port && port !== "—" ? port : state.settings.serialPort,
    baud: baud || state.settings.baud,
  };
}

function linkFromSettings(): VehicleLink {
  if (state.transport === "mission") {
    return {
      mode: "via-mission",
      transport: "ws",
      endpoint: state.settings.missionHost.trim() || "airyn-mission.local:7700",
    };
  }
  if (state.transport === "udp") {
    return {
      mode: "direct",
      transport: "udp",
      endpoint: `${state.settings.udpHost.trim() || "127.0.0.1"}:${state.settings.udpPort.trim() || "14550"}`,
    };
  }
  return {
    mode: "direct",
    transport: "serial",
    endpoint: `${state.settings.serialPort || "—"} @ ${state.settings.baud || "921600"}`,
  };
}

function setSettingValue(name: keyof AppSettings, value: string): void {
  state.settings[name] = value.trim();
}

function syncSettingsFromControls(): void {
  $$<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    const name = control.dataset["setting"] as keyof AppSettings | undefined;
    if (name) setSettingValue(name, control.value);
  });
}

function renderSettingsControls(): void {
  $$<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    const name = control.dataset["setting"] as keyof AppSettings | undefined;
    if (name && control.value !== state.settings[name]) control.value = state.settings[name];
  });
  $$<HTMLLabelElement>(".radio[data-transport]").forEach((r) => {
    const active = r.dataset["transport"] === state.transport;
    r.classList.toggle("is-active", active);
    const input = r.querySelector<HTMLInputElement>("input[type='radio']");
    if (input) input.checked = active;
  });
  const langSelect = $<HTMLSelectElement>("[data-bind='lang']");
  if (langSelect) langSelect.value = state.lang;
}

function applyActiveVehicleLink(send = true): void {
  const v = activeVehicle();
  if (!v) return;
  syncSettingsFromControls();
  const link = linkFromSettings();
  v.link = link;
  persist();
  renderLinkPath();
  renderConnectButton();
  renderFleetChips();
  renderActive();
  refreshTransportStatusFromActive();
  if (send) {
    sendBridge({ type: "configureLink", id: v.id, link });
  }
}

function loadSettingsFromActiveVehicle(): void {
  const v = activeVehicle();
  if (!v) return;
  state.transport = transportFromLink(v.link);
  state.settings = { ...state.settings, ...settingsFromLink(v.link) };
  renderSettingsControls();
}

function setLang(lang: Lang): void {
  state.lang = lang;
  persist();
  applyI18n();
  // refresh dynamic UI fragments not handled by data-i18n
  setCam(state.cam);
  renderActiveLinkRail();
  renderLinkPath();
  renderConnectButton();
  renderFlightModeRail();
  renderCommandControls();
  refreshLedger();
  renderCalPrompt();
  renderWaypointTable();
  renderLog();
  renderSettingsControls();

  $$<HTMLButtonElement>(".lang-toggle[data-lang]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset["lang"] === lang);
  });

  pushLog("info", "log.tag.ui", "log.msg.lang_switch", lang === "zh" ? "繁體中文" : "English");
}

function setTransport(tr: Transport, send = true): void {
  state.transport = tr;
  renderSettingsControls();
  applyActiveVehicleLink(send);
}

// ---------- 13. Init ----------

function bind(): void {
  // Sidebar nav (matches both legacy .tab[data-tab] and the new vertical
  // .nav-item[data-tab] markup so the binding survives layout reshuffles).
  $$<HTMLButtonElement>("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset["tab"];
      if (name) setView(name);
    });
  });

  // Cam thumbs
  $$<HTMLButtonElement>(".cam--thumb[data-cam]").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const name = thumb.dataset["cam"];
      if (name) setCam(name);
    });
  });

  // Cam REC + IR
  $<HTMLElement>("[data-action='rec']")?.addEventListener("click", toggleRec);
  $<HTMLElement>("[data-action='ir-opt']")?.addEventListener("click", toggleIROpt);

  // Connect button (rail) — toggles the *active* vehicle's link only.
  $<HTMLElement>("[data-action='connect-flight']")?.addEventListener("click", () => {
    setActiveVehicleConnected(!(activeVehicle()?.flight ?? false));
  });
  // Settings connect / disconnect — same scope (active vehicle).
  $<HTMLElement>("[data-action='settings-connect']")?.addEventListener("click", () => {
    applyActiveVehicleLink();
    setActiveVehicleConnected(true);
  });
  $<HTMLElement>("[data-action='settings-disconnect']")?.addEventListener("click", () => {
    setActiveVehicleConnected(false);
  });

  // Log filter chips
  $$<HTMLButtonElement>(".chip[data-filter]").forEach((c) => {
    c.addEventListener("click", () => {
      const f = c.dataset["filter"] as LogFilter | undefined;
      if (f) setLogFilter(f);
    });
  });
  // Log search
  $<HTMLInputElement>(".search-input")?.addEventListener("input", (e) => {
    state.search = (e.target as HTMLInputElement).value;
    renderLog();
  });

  // Calibration step click
  $$<HTMLButtonElement>(".cal-step[data-cal-step]").forEach((s) => {
    s.addEventListener("click", () => {
      const n = Number(s.dataset["calStep"]);
      if (n) setCalStep(n);
    });
  });
  $<HTMLElement>("[data-action='cal-capture']")?.addEventListener("click", calCapture);
  $<HTMLElement>("[data-action='cal-skip']")?.addEventListener("click", () => {
    if (state.calStep < 4) setCalStep(state.calStep + 1);
  });

  // Mission buttons
  $<HTMLElement>("[data-action='wp-new']")?.addEventListener("click", newWaypoint);
  $<HTMLElement>("[data-action='wp-clear']")?.addEventListener("click", clearWaypoints);
  $<HTMLElement>("[data-action='wp-upload']")?.addEventListener("click", uploadPlan);
  $<HTMLElement>("[data-action='wp-download']")?.addEventListener("click", downloadPlan);
  $<HTMLElement>(".plate--mission")?.addEventListener("click", addWaypointFromMissionPlate);
  $<HTMLTableSectionElement>(".wp-table tbody")?.addEventListener("change", (ev) => {
    handleWaypointTableInput(ev.target);
  });
  $<HTMLTableSectionElement>(".wp-table tbody")?.addEventListener("click", (ev) => {
    if (handleWaypointTypeClick(ev.target)) return;
    handleWaypointDelete(ev.target);
  });

  // Flight command buttons
  $$<HTMLButtonElement>("[data-command]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const command = btn.dataset["command"] as VehicleCommand | undefined;
      if (command) sendVehicleCommand(command);
    });
  });

  // Settings transport radios
  $$<HTMLLabelElement>(".radio[data-transport]").forEach((r) => {
    r.addEventListener("click", (ev) => {
      ev.preventDefault();
      const tr = r.dataset["transport"] as Transport | undefined;
      if (tr) setTransport(tr);
    });
  });
  $$<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    control.addEventListener("change", () => applyActiveVehicleLink());
  });
  $<HTMLSelectElement>("[data-bind='lang']")?.addEventListener("change", (ev) => {
    const lang = (ev.target as HTMLSelectElement).value as Lang;
    if (lang === "zh" || lang === "en") setLang(lang);
  });

  // Lang toggle
  $$<HTMLButtonElement>(".lang-toggle[data-lang]").forEach((b) => {
    b.addEventListener("click", () => {
      const l = b.dataset["lang"] as Lang | undefined;
      console.log("[airyn] lang-toggle click", { clicked: l, current: state.lang });
      if (l && l !== state.lang) setLang(l);
    });
  });

  window.addEventListener("keydown", (ev) => {
    const target = ev.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    const key = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && key === "u") {
      ev.preventDefault();
      uploadPlan();
    } else if ((ev.ctrlKey || ev.metaKey) && key === "d") {
      ev.preventDefault();
      downloadPlan();
    } else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && COMMAND_KEYMAP[key]) {
      ev.preventDefault();
      sendVehicleCommand(COMMAND_KEYMAP[key]!);
    } else if (key === "n") {
      ev.preventDefault();
      newWaypoint();
    } else if (ev.key === " ") {
      ev.preventDefault();
      calCapture();
    }
  });
}

function tickClock(): void {
  const now = new Date();
  const clock = $<HTMLTimeElement>("#clock");
  const date = $<HTMLSpanElement>("#date");
  if (clock) clock.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  if (date) date.textContent = `${now.getFullYear()}·${pad2(now.getMonth() + 1)}·${pad2(now.getDate())}`;
}

function init(): void {
  bind();
  applyI18n();
  setLang(state.lang); // applies lang toggle active class
  setTransport(state.transport, false);
  setCam(state.cam);
  initMap();
  renderFleetChips();
  setView(state.view);
  setCalStep(state.calStep);
  renderWaypointTable();
  renderLog();
  refreshLedger();
  resetTelemetryDisplay();
  renderActive();
  renderLinkPath();
  renderActiveLinkRail();
  renderConnectButton();
  renderFlightModeRail();
  renderCommandControls();

  // Open WebSocket to ground/src/bun simulator/bridge.
  connectBridge();

  tickClock();
  setInterval(tickClock, 1000);

  // Ground-side dead-reckoning runs while any vehicle has linkActive=false.
  // 4 Hz is plenty for a visual cue; nobody is acting on these positions.
  setInterval(predictTick, 250);
}

init();
