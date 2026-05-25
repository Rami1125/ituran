/**
 * Noa Ituran - Google Apps Script Email Parser
 * File Name: Code.gs
 * Description: Time-triggered script to parse CSV reports and real-time PTO alert emails from "call@ituran.info"
 *              and send the parsed structured metrics to the Noa Ituran API Endpoint.
 */

// Replace this with your actual Noa Ituran App URL (from secrets / settings)
var API_WEBHOOK_URL = "https://YOUR_APP_URL/api/webhook";

/**
 * Main parser entry point. Recommend triggering this every 5 or 10 minutes.
 */
function parseIturanEmails() {
  Logger.log("Starting Noa Ituran Gmail Parser...");
  
  // Search Gmail for unread emails from call@ituran.info
  var query = "from:call@ituran.info is:unread";
  var threads = GmailApp.search(query, 0, 10);
  
  if (threads.length === 0) {
    Logger.log("No new unread Ituran emails found.");
    return;
  }
  
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (message.isUnread()) {
        try {
          processIturanMessage(message);
          // Mark as read after successful parsing to avoid double processing
          message.markRead();
        } catch (err) {
          Logger.log("Error processing message ID " + message.getId() + ": " + err.toString());
        }
      }
    }
  }
}

/**
 * Process a single Ituran email message
 */
function processIturanMessage(message) {
  var subject = message.getSubject();
  var body = message.getPlainBody();
  var date = message.getDate();
  var attachments = message.getAttachments();
  
  Logger.log("Processing Email: " + subject + " (" + date + ")");
  
  var parsedData = {
    time: date.toISOString(),
    vehicle: "מרצדס מנוף / איסוזו",
    driver: "חכמת / עלי",
    latitude: null,
    longitude: null,
    address: "",
    ptoState: "unknown",
    alertType: "location_update",
    text: ""
  };
  
  // 1. Check for CSV attachments (often structured fleet reports from Ituran)
  var csvParsed = false;
  for (var k = 0; k < attachments.length; k++) {
    var attachment = attachments[k];
    if (attachment.getContentType() === "text/csv" || attachment.getName().indexOf(".csv") !== -1) {
      Logger.log("Found CSV Attachment: " + attachment.getName());
      parseCsvAttachment(attachment, parsedData);
      csvParsed = true;
      break;
    }
  }
  
  // 2. If no CSV, parse the text body (typical for instant PTO Alerts: "התרעת תנועה / איתורן PTO פתוח/סגור")
  if (!csvParsed) {
    Logger.log("No CSV found. Parsing raw email text body.");
    parseEmailTextBody(body, subject, parsedData);
  }
  
  // 3. Send parsed payload to Express / Next.js backend endpoint
  sendWebhookToApp(parsedData);
}

/**
 * Handle CSV attached reports
 */
function parseCsvAttachment(attachment, parsedData) {
  var csvContent = attachment.getDataAsString("UTF-8");
  var lines = Utilities.parseCsv(csvContent);
  
  if (lines.length < 2) {
    Logger.log("CSV attachment is empty or malformed.");
    return;
  }
  
  // Deduce column positions (Dynamic mapping search)
  var headers = lines[0].map(function(h) { return h.toLowerCase().trim(); });
  var driverCol = headers.indexOf("driver") !== -1 ? headers.indexOf("driver") : headers.indexOf("נהג");
  var vehicleCol = headers.indexOf("vehicle") !== -1 ? headers.indexOf("vehicle") : headers.indexOf("רכב");
  var addressCol = headers.indexOf("address") !== -1 ? headers.indexOf("address") : headers.indexOf("כתובת");
  var latCol = headers.indexOf("latitude") !== -1 ? headers.indexOf("latitude") : headers.indexOf("קו רוחב");
  var lngCol = headers.indexOf("longitude") !== -1 ? headers.indexOf("longitude") : headers.indexOf("קו אורך");
  var ptoCol = headers.indexOf("pto") !== -1 ? headers.indexOf("pto") : headers.indexOf("מצב מנוף");
  
  // Read the first data record (latest point)
  var lastRow = lines[1];
  
  if (driverCol !== -1) parsedData.driver = lastRow[driverCol];
  if (vehicleCol !== -1) parsedData.vehicle = lastRow[vehicleCol];
  if (addressCol !== -1) parsedData.address = lastRow[addressCol];
  if (latCol !== -1) parsedData.latitude = parseFloat(lastRow[latCol]);
  if (lngCol !== -1) parsedData.longitude = parseFloat(lastRow[lngCol]);
  if (ptoCol !== -1) {
    var val = lastRow[ptoCol].toLowerCase();
    parsedData.ptoState = (val.indexOf("open") !== -1 || val.indexOf("פתוח") !== -1) ? "open" : "closed";
  }
}

/**
 * Parse text content of email body for PTO and status alerts
 */
function parseEmailTextBody(body, subject, parsedData) {
  parsedData.text = body;
  
  // Determine driver from text content
  if (body.match(/(חכמת|Hikmat|حكمت)/i)) {
    parsedData.driver = "חכמת (Hikmat)";
    parsedData.vehicle = "מרצדס מנוף - מספר שילדה 992817";
  } else if (body.match(/(עלי|Ali|علي)/i)) {
    parsedData.driver = "עלי (Ali)";
    parsedData.vehicle = "איסוזו משטח - מספר שילדה 882731";
  }
  
  // Match PTO state (מצב מנוף / כוח PTO פתוח / סגור)
  if (body.match(/(PTO פתוח|פתח PTO|מנוף למעלה|מנוף פתוח|PTO Open|PTO Opened|פתח)/i)) {
    parsedData.ptoState = "open";
    parsedData.alertType = "critical";
  } else if (body.match(/(PTO סגור|סגר PTO|מנוף למטה|מנוף סגור|PTO Close|PTO Closed|סגר)/i)) {
    parsedData.ptoState = "closed";
    parsedData.alertType = "location_update";
  }
  
  // Attempt to extract Israel lat/lng if present inside text alerts in decimal formats (e.g. 32.1234, 34.8765)
  var coordsMatch = body.match(/(\d{2}\.\d{4,6})\s*,\s*(\d{2}\.\d{4,6})/);
  if (coordsMatch) {
    parsedData.latitude = parseFloat(coordsMatch[1]);
    parsedData.longitude = parseFloat(coordsMatch[2]);
  }
  
  // Attempt to extract address using simple Regex heuristic
  var addressMatch = body.match(/(כתובת|בכתובת|במקום|מיקום|location)\s*:\s*([^\n\r]+)/i);
  if (addressMatch) {
    parsedData.address = addressMatch[2].trim();
  } else {
    // Try Hebrew keyword match
    var addressHebMatch = body.match(/(?:ברחוב|באיזור|ליד|ב-)\s+([א-ת\s0-9]+(?:תל אביב|הרצליה|חולון|פתח תקווה|נתניה|ראשון לציון))/);
    if (addressHebMatch) {
      parsedData.address = addressHebMatch[0].trim();
    }
  }
}

/**
 * Send parsed payload to backend Noa Ituran Express endpoint
 */
function sendWebhookToApp(parsedData) {
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(parsedData),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(API_WEBHOOK_URL, options);
    Logger.log("Webhook Response Code: " + response.getResponseCode());
    Logger.log("Response Body: " + response.getContentText());
  } catch (err) {
    Logger.log("Failed to post payload to Noa Ituran webhook: " + err.toString());
  }
}

/**
 * Configure target Webhook URL dynamically in Apps Script project properties
 */
function setWebhookUrl(url) {
  API_WEBHOOK_URL = url;
  Logger.log("Webhook destination updated to: " + API_WEBHOOK_URL);
}
