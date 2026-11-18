const { execSync } = require("child_process");

// コマンドライン引数からコミットメッセージを取得（省略時は "update"）
const msg = process.argv[2] || "update";

try {
  // 1. 先にGAS用のビルド＆デプロイを実行（ここで失敗したらGitHubには上げない）
  console.log("=== [1/2] GAS ビルド＆デプロイ開始 ===");
  execSync("node build-gas.js", { stdio: "inherit" });

  // 2. GitHubへプッシュ
  console.log("\n=== [2/2] GitHub へプッシュ開始 ===");
  execSync("git add .", { stdio: "inherit" });

  // 変更がある場合のみコミット＆プッシュ
  const status = execSync("git status --porcelain").toString().trim();
  if (status) {
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("\n✅ GASとGitHubの両方の更新が完了しました！");
  } else {
    console.log("\nℹ️ ファイルの変更がないため、GitHubへのプッシュはスキップしました。");
  }
} catch (err) {
  console.error("\n❌ 途中でエラーが発生したため中断しました。");
  process.exit(1);
}
