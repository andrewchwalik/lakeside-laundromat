const SPREADSHEET_ID = "1mu-P1HyVcjFNR1S5wNP0M5w5Yaw_u1BpEWyOjQ8YHNk";

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("WEIGHT_WRITER_SECRET");

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return json_({ ok: false, error: "Unauthorized." });
    }

    const sheetName = String(payload.sheetName || "");
    const allowedSheets = [
      "Coffee & Cream",
      "Erie Market",
      "Erie Guest House",
      "Hotel Lakeside",
      "Fountain Inn",
      "Wesley Lodge",
    ];

    if (!allowedSheets.includes(sheetName)) {
      return json_({ ok: false, error: "Invalid client." });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheetName);
    const usesBins = Boolean(payload.usesBins);
    const entryWidth = usesBins ? 7 : 4;

    sheet.getRange(4, 1, 1, entryWidth).insertCells(SpreadsheetApp.Dimension.ROWS);
    sheet.getRange(5, 1, 1, entryWidth).copyTo(sheet.getRange(4, 1, 1, entryWidth));

    const date = new Date();
    const dateCell = sheet.getRange(4, 1);
    dateCell.setValue(date);
    dateCell.setNumberFormat("MM/dd/yyyy");

    if (usesBins) {
      sheet.getRange(4, 2).setValue(payload.binColor);
      sheet.getRange(4, 4).setValue(Number(payload.weight));
      sheet.getRange(4, 7).setValue(false);
    } else {
      sheet.getRange(4, 2).setValue(Number(payload.weight));
      sheet.getRange(4, 4).setValue(false);
    }

    SpreadsheetApp.flush();
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: "The spreadsheet entry could not be saved." });
  }
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
