# 📬 家庭信件管家

拍照或上传家里的信(照片 / PDF / Word),AI 自动读出重点,整理成列表;收件人不是家庭成员会显示 ⚠️ 警告。

## 功能

| 需求 | 做法 |
|---|---|
| 家人加入 | 管理员输入家人邮箱 → 对方收到登录链接,点击即自动加入。支持邮箱魔法链接和 Google 登录。没有邮箱的家人(小孩)可只作为「收件人名字」登记。 |
| 登录 | Supabase Auth。无密码;数据靠数据库行级安全(RLS)隔离,**只有本家庭成员**能读写信件和文件。 |
| 添加信件 | 手机拍照(调用相机)/ 选照片 / 上传 PDF、.docx。多张照片可作为同一封多页信。 |
| 自动重点 | Claude 读取内容 → 标题、寄件人、收件人、地址、分类、是否重要、截止日期、金额、简介、全文转录;疑似诈骗会提醒。 |
| 列表 | 手机是卡片、电脑是表格。可筛选分类 / 重要 / 只看我的,可搜索。★ 标重要,开关控制提醒。 |
| 详情 | 简介、全文、原件(私有签名链接),所有字段可手动改。 |
| 非家庭成员警告 | 信上收件人与家人姓名/别名都对不上 → ⚠️。可一键更正「其实是给某某的」,并自动记为别名。 |
| 提醒 | 开启提醒的信,在到期前 14 天内出现在「需要处理」区,并标注相关家人。 |

## 部署步骤

1. **建 Supabase 项目**(supabase.com,免费档即可)。
2. **建表**:在 SQL Editor 运行 `supabase/migrations/0001_init.sql`(或 `supabase db push`)。
3. **Auth 设置**:Authentication → URL Configuration,把 Site URL 和 Redirect URLs 设为你部署后的网址(本地开发加 `http://localhost:5173`)。要用 Google 登录,在 Providers 里启用 Google 并填 OAuth 凭据。
4. **部署 AI 函数**:
   ```bash
   supabase functions deploy analyze-letter
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # 可选:ANTHROPIC_MODEL(默认 claude-sonnet-5-5)、SUMMARY_LANGUAGE(默认 简体中文)
   ```
5. **前端**:`cp .env.example .env`,填入项目 URL 和 anon/publishable key。
   ```bash
   npm install
   npm run dev        # 本地开发
   npm run build      # 产物在 dist/,可部署到 Vercel / Netlify / Cloudflare Pages
   ```
6. 手机浏览器打开网址 →「添加到主屏幕」,就是一个 App。

## 隐私说明

- 文件存放在私有 Storage bucket,只通过 1 小时有效的签名链接显示;PWA 不缓存任何 API/存储请求。
- 分析时,信件图片/文字会发送给 Anthropic API。Anthropic key 只在服务端函数里,不进前端。
- 前端只持有公开的 anon key,真正的访问控制是 `0001_init.sql` 里的 RLS 策略。

## 已知限制 / 后续

- **提醒目前只在 App 内**(「需要处理」区)。尚未做邮件 / 手机推送。下一步可用 Supabase Cron + Edge Function + Resend 每天给「相关家人」发邮件,或做 Web Push。
- 目前一个账号只属于一个家庭。
- 不支持旧版 `.doc`(只支持 `.docx`);iPhone 的 HEIC 若浏览器无法解码会提示改用 JPG。
- 手机号 / Apple 登录未做(Apple 需要 $99/年开发者账号,手机号短信按条收费)。

## 开发

```bash
npm test          # 收件人匹配逻辑单测
npm run typecheck
```
