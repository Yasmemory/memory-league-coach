/**
 * Bind this script to the existing practice spreadsheet.
 * Script Properties:
 *   JOURNAL_IMPORT_URL = https://YOUR-APP.vercel.app/api/import
 *   JOURNAL_IMPORT_SECRET = the same 32+ character IMPORT_SECRET configured on the site
 *
 * Run syncJournal once manually to grant permissions. Then add a time-driven trigger.
 * The source sheet is read-only; all rows are sent again so edits and cancellations propagate.
 */
function syncJournal() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("JOURNAL_IMPORT_URL");
  var secret = props.getProperty("JOURNAL_IMPORT_SECRET");
  if (!url || !/^https:\/\/.+\/api\/import$/.test(url) || !secret || secret.length < 32) {
    throw new Error("Configure JOURNAL_IMPORT_URL and JOURNAL_IMPORT_SECRET in Script Properties.");
  }
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheets().find(function (item) { return item.getSheetId() === 919937317; });
  if (!sheet) throw new Error("Source tab 919937317 not found.");
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return;
  var header = data[0].map(function (item) { return String(item).trim(); });
  var keys = ["UUID", "RegisteredAt", "TrainingDate", "DiscordUserId", "DisplayName", "Event", "Count", "Score", "Correct", "MessageId", "MessageUrl", "SourceType", "Status", "TimeSeconds"];
  keys.forEach(function (key) { if (header.indexOf(key) < 0) throw new Error("Missing column: " + key); });
  var rows = data.slice(1).filter(function (cells) { return cells[header.indexOf("UUID")]; }).map(function (cells) {
    var row = {};
    keys.forEach(function (key) { row[key] = cells[header.indexOf(key)]; });
    return row;
  });
  for (var offset = 0; offset < rows.length; offset += 100) {
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + secret },
      payload: JSON.stringify({ rows: rows.slice(offset, offset + 100) }),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error("Import failed at row " + (offset + 2) + ": HTTP " + response.getResponseCode() + " " + response.getContentText());
    }
  }
}
