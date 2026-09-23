# 練習記録と振り返り

Memory League Coach の `master` とは独立した10種競技用アプリです。Vercelでは同じリポジトリから**別プロジェクト**として登録し、Root Directory を `ten-events`、Production Branch を `ten-event-student-journal` に設定します。元サイトのDBを使い回さず、新しいPostgreSQLを接続します。

## 現在できること

- Discord OAuth（identifyのみ）でログイン
- DiscordユーザーIDによる本人の記録の分離と、講師IDによる生徒切り替え
- 種目別一覧、取消の表示切り替え、30件ずつのページ送り
- 練習ごとの作戦・振り返り・次回行動の保存、講師コメント
- 既存スプレッドシートの列名をJSONキーとする保護付き取り込みAPI。UUIDで再取り込みしても重複せず、振り返りは保持

## セットアップ

1. `npm install` を `ten-events` で実行。
2. `.env.example` の各値を設定する。秘密値はリポジトリへコミットしない。
3. Discord Developer PortalでOAuth2 Redirect URLを `APP_ORIGIN/api/auth/callback` に設定。
4. 新しいDBに `npx prisma migrate deploy` を実行し、本番では `npx prisma migrate deploy` を実行。
5. `npm run typecheck`、`npm run build`、`npm run dev` で検証。
6. `POST /api/import` に `Authorization: Bearer <IMPORT_SECRET>` と `{"rows":[...]}` を送る（最大100行/回）。JSONキーは `UUID`, `RegisteredAt`, `TrainingDate`, `DiscordUserId`, `DisplayName`, `Event`, `Count`, `Score`, `Correct`, `MessageId`, `MessageUrl`, `SourceType`, `Status`, `TimeSeconds`。スプシに紐づける Apps Script は \`integration/sync.gs\` に用意済み。\`JOURNAL_IMPORT_URL\` と \`JOURNAL_IMPORT_SECRET\` を Script Properties に設定し、最初に手動実行してから時間主導トリガーを設定する。スプシそのものは変更しない。

## 公開前に必要な確認

- Discordアプリのキー、新DB、公開URL、IMPORT_SECRETの設定
- BotまたはGASからサンプル行を投入し、UUIDの重複・取消・値の更新を確認
- 生徒2人のログインで相互閲覧できないことと講師の切り替えを確認
- 練習結果の採点仕様（Score/Correct/TimeSeconds）の種目別表示を確認
