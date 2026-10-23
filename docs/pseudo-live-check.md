# 伪直播联调核查（2026-10-22）

## 建议

本次小黑板演示采用真伪直播，完整播放单个视频，不裁剪、不循环。账号级真伪直播开关尚未核实或修改；需要开启后再安排测试。

| 项目 | 已核查依据 | 尚需实测 |
| --- | --- | --- |
| 播放 | 普通伪直播以 FFmpeg 重新推流；真伪直播按时钟提供素材切片，不重新推流 | 该账号实际执行模式、观看页 SDK 播放 |
| 字幕 | 真伪直播任务读取频道字幕开关，可复用原字幕，或提取音频进入 ASR | 本次素材字幕生成、SRT 获取与时间对齐 |
| 回放 | 真伪直播结束回调可保存场次记录；素材来源记录标为 material，并关联原素材 MP4 | 当前账号回放 API 返回及字幕关联 |

不能将“支持字幕与回放的代码逻辑”写成“本账号实测成功”。真伪直播的回放可能复用素材，不代表重新完成一次直播流录制。

依据：研发知识库 projects/simulated-live.md；DiskVideoService.java 689–732、1166–1208；simulated-live/src/app.service.ts 744–770；consumers/message.consumer.ts 90–117；job/speech-recognition.job.ts 45–100；DiskVideoLiveNotifyController.java 311–495。

## 已完成准备

- 新频道：8651592，小黑板·伪直播联调；通过 /live/v4/channel/create-init 创建，未开播
- 原频道 8648472 和本地 .env 的频道选择未更改
- 新频道实时字幕开启，中文，云端识别；保存后刷新仍保持开启
- 素材：0e181a7e9121177f43e7164050992371，quadratic-formula-554s.mp4
- 素材接口确认 status=normal，duration=553 秒；源网页显示 9:14
- 视频来源：https://www.bilibili.com/video/BV1tw411j7kU/ （一元二次方程的解——公式法与判别式）
- 下载文件：data/test-media/quadratic-formula-554s.mp4
- 上传使用正常客户后台入口；没有找到通用 AppID/AppSecret 素材上传开放接口，不能把这一步宣称为开放 API 上传

## 未完成与阻塞

- /live/v3/channel/stream/add-disk-videos 不传 startTimes 返回 400 param validate error，与文档允许不设置时间不一致
- 客户后台添加素材会要求明确播出时间；已取消保存，避免默认时间意外开播
- 素材已入库，但尚未关联播出任务；待确定开播时间、确认账号真伪直播模式后再创建任务
- 还没有实际生成本场回放或字幕；端到端验证待播完后进行
- 小黑板回放同步目前只接受 auto/manual 来源；接入真伪直播时需针对 material 来源做受约束适配，不能直接宣称现有同步已兼容

## 播出任务确认（15:35 更新）

- 用户已开启账号真伪直播；刷新客户后台后 realDiskVideoEnabled=Y
- 已通过客户后台创建任务 hnfy1d28kq，关联上述素材
- 播出时间：2026-10-22 15:45:00 至 15:54:13（北京时间），单次完整播放
- 公开查询接口确认任务存在，streamStatus=waiting
- 研发知识库只读查询 disk_video：该任务 channelId=8651592，streamType=vod，status=docker_wait。按代码及知识库定义，streamType=vod 标识真伪直播任务，已确认没有走普通直播流推送类型
- 前述“未关联、未安排时间、账号开关未确认”为准备阶段历史状态，现已完成；字幕及回放仍待本次播完后验证

## 播后实测（2026-10-22 15:59–16:01）

- 频道 liveStatus=playback；播出任务 streamStatus=end
- 回放 fileId=e23a7e09c007dc18a4c7242356b8402f，场次 channelSessionId=hnfydtjp1l
- 回放 origin=material，开始时间 20261022154500，duration=553 秒；与本次任务匹配
- /live/v3/channel/record/get 返回 MP4、M3U8；MP4 Range 请求实际返回 206、video/mp4、1024 字节（总大小 16163419）
- 中文字幕 id=55754，status=finish，source=chatRealtimeSrt
- SRT 实际下载并解析成功，240 条；首条 0.31–1.80 秒“大家好，这个视频呢，”，末条 548.11–549.60 秒“，我们就选D了。”
- 接口字幕 URL 使用 polyv-chat.oss-cn-shenzhen-internal.aliyuncs.com 内网域名；仅替换为同一 OSS bucket 的公网域名 polyv-chat.oss-cn-shenzhen.aliyuncs.com 后 HTTP 200。需在客户侧接入中解决该地址问题，不能声称原地址可直接访问
- 下载的字幕保存在 data/test-media/verified-subtitle.srt；回放与场次元数据仅保存在忽略的 data 目录
- 此次实测证明真伪直播能生成本场回放关联和可用字幕。未在直播过程中观察播放器，不能声称已经验证实时字幕展示；小黑板同步还需适配 material 来源与上述字幕域名，不等于当前应用全链路已通
