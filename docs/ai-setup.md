# 当前已验证配置（2026-10-23）

已切换为技术支持授权的 `deepseek-v4.1-flash-1017`，接口仍为 `https://dashscope.aliyuncs.com/compatible-mode/v1`，显式关闭思考模式。最小文本请求成功；图片识别与 JSON 输出测试成功（235 tokens，其中图片输入192 tokens）。密钥仅在本地 `.env`。之前 Qwen 的403属于该密钥调用限制，不代表密钥无效。真实课程验证已完成一轮：240条字幕、3个真实标记、9帧，形成2个难点和1个重点；两段难点解释已核对。结果位于后台AI验证副本，仍未发布。详见 ai-course-verification.md。已发布人工内容不重建、不覆盖。

以下为此前准备说明，Qwen 配置仅作历史参考。

# AI服务准备

2026-10-22核对官方文档。先选阿里云百炼北京地域的qwen3-vl-plus，使用非思考模式（此模型默认关闭思考）及JSON Object输出，匹配当前图片+字幕的请求结构。

1. 登录或注册阿里云，进入百炼控制台，按提示开通服务
2. 选择华北2（北京）地域，在API Key页面创建密钥。API Key与接口地域必须一致
3. 在工程根目录.env填写AI_API_KEY。AI_BASE_URL和AI_MODEL已在未配置密钥时预填
4. 运行 `npm run check:ai`：仅发送自生成的红色色块图片验证图片输入和JSON输出，不发送课程素材，不打印密钥
5. 检查通过后重启本地服务，再验证真实字幕与关键帧生成课程报告。连通性通过不能当作课程分析效果通过

建议配置：

```dotenv
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen3-vl-plus
AI_API_KEY=在本地填写
```

如果业务空间要求专属API Host，请使用控制台提供的Host，将地址改为 `https://实际Host/compatible-mode/v1`；不要填文档里的WorkspaceId占位符。

北京地域公开价格：单次输入不超过32K Token时，输入1元/百万Token，输出10元/百万Token；更长输入单价不同。举例总输入10000 Token、输出2000 Token约0.03元，仅为按单价计算，不是每次课的固定费用，图片也计入输入。免费额度和可用模型以账号控制台为准，不依赖免费额度作为前提。

官方依据：
- 获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
- API Key管理：https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key
- 图片理解：https://docs.bailian.console.aliyun.com/en/model-studio/vision
- JSON输出：https://help.aliyun.com/zh/model-studio/qwen-structured-output
- 价格：https://help.aliyun.com/zh/model-studio/model-pricing

当前状态（2026-10-23）：密钥已保存到本地 .env（未写入文档）。使用现有北京地域公共地址调用 qwen3-vl-plus，图片与最小文本请求均返回 HTTP 403，code=access_denied，message=Access denied by API-Key restrictions。尚未通过连通性验证，也未发送课程素材。需核对该密钥对应的 API Host、模型访问范围及 IP 限制；不能仅凭此响应判定密钥无效。应用服务尚未重启启用该配置。
