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

    const firstEntryRow = 4;
    const lastEntryRow = 2003;
    const dateValues = sheet
      .getRange(firstEntryRow, 1, lastEntryRow - firstEntryRow + 1, 1)
      .getValues();
    const firstBlankIndex = dateValues.findIndex(([value]) => value === "" || value === null);

    if (firstBlankIndex === -1) {
      return json_({ ok: false, error: "The entry table is full." });
    }

    const targetRow = firstEntryRow + firstBlankIndex;
    const existingEntryCount = dateValues.filter(([value]) => value !== "" && value !== null).length;

    if (targetRow !== firstEntryRow) {
      sheet
        .getRange(firstEntryRow, 1, 1, entryWidth)
        .copyTo(sheet.getRange(targetRow, 1, 1, entryWidth));
    }

    const date = new Date();
    const dateCell = sheet.getRange(targetRow, 1);
    dateCell.setValue(date);
    dateCell.setNumberFormat("MM/dd/yyyy");

    if (usesBins) {
      sheet.getRange(targetRow, 2).setValue(payload.binColor);
      sheet.getRange(targetRow, 4).setValue(Number(payload.weight));
      sheet.getRange(targetRow, 7).setValue(false);
    } else {
      sheet.getRange(targetRow, 2).setValue(Number(payload.weight));
      sheet.getRange(targetRow, 4).setValue(false);
    }

    sheet
      .getRange(firstEntryRow, 1, existingEntryCount + 1, entryWidth)
      .sort({ column: 1, ascending: false });

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
