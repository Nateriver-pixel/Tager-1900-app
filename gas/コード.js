function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('英単語アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
