const fs = require("fs");
const { execSync } = require("child_process");

// ★ここにあなたのデプロイID（AKfycb...）を入れる
const DEPLOYMENT_ID = "AKfycbwubviV2YX0-yX_2JcJDVVL5bfkPuPins-XAMwUwjHI3dxhaQ3gQryyDs9rzim7H_RD";

let html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("style.css", "utf8");
const wordsJs = fs.readFileSync("words.js", "utf8");
const mainJs = fs.readFileSync("main.js", "utf8");

// ★第2引数を () => ... にすることで、コード内の「$」記号が壊れるのを完全に防ぐ！
html = html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/i, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script[^>]*src=["']words\.js["'][^>]*><\/script>/i, () => `<script>\n${wordsJs}\n</script>`);
html = html.replace(/<script[^>]*src=["']main\.js["'][^>]*><\/script>/i, () => `<script>\n${mainJs}\n</script>`);

fs.writeFileSync("gas/index.html", html, "utf8");
console.log("✅ 1. GAS用の統合HTMLを安全に生成しました！");

console.log("🚀 2. GASへ送信＆公開URL（/exec）を更新中...");
execSync(`clasp push && clasp deploy -i ${DEPLOYMENT_ID} -d "auto"`, { cwd: "gas", stdio: "inherit" });
console.log("🎉 3. 公開URLの最新化まで完了しました！");
