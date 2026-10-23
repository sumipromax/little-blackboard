# 实现计划与接口依据

- 独立小黑板模块：播放器适配器提供场次、时间及回看；不把业务存储写进保利威SDK。
- 极简观看页：SDK逻辑层 + 原生HTML；独立后台：报告列表、片段详情、草稿、素材选择、单次发布。
- 原生控件降级：空工程无既有组件库。字号12/14/16，主色#3F76FC，8网格，白底、浅色分区；一个主操作为确认发布。灰色说明不加句号。
- 本地SQLite持久化、服务器身份cookie、管理员口令、5秒服务端撤销期限、按学员去重。演练与真实数据隔离。
- 真实截图API五分钟更新，不能用作精确帧。回放MP4下载后ffmpeg本地取帧；无可用视频时不伪造关键帧。
- 实时流通常没有可靠的绝对播放时间：保存点击服务端时间、播放器信息和可用getStartDate；无绝对媒体时间则采用录制起点+校准延迟，并明确标注估算，未校准不自动生成精准片段。
- 回放、字幕回调验签与幂等；字幕不含sessionId，通过fileId查询录制元数据关联场次。单场多录制分片暂阻止自动分析，避免错误拼接时间轴。
- AI JSON schema校验，段落范围限制在实际字幕内。发布前由运营确认。无AI密钥的演练使用固定样例，明确标识，不冒充模型结果。

## 官方文档

- https://help.polyv.net/index.html#/live/js/new_sdk/live_watch_sdk/articles/product/introduce
- https://help.polyv.net/index.html#/live/js/new_sdk/live_watch_sdk/articles/product/fast-start
- https://help.polyv.net/index.html#/live/js/new_sdk/live_watch_sdk/articles/verify-next/overview
- https://help.polyv.net/index.html#/live/api/channel/operate/get_watch_api_token
- https://help.polyv.net/index.html#/live/api/channel/operate/get_capture_image
- https://help.polyv.net/index.html#/live/api/callback/record_callback
- https://help.polyv.net/index.html#/live/api/callback/subtitle_callback
- https://help.polyv.net/index.html#/live/api/channel/playback/get_record_file
- https://help.polyv.net/index.html#/live/api/v4/material/material-list

公开文档已核对；客户账号权限、域名白名单、实际SDK播放及回调链路需使用测试账号验证。暂无客户凭据，不使用公司内部凭据代替客户接入。
