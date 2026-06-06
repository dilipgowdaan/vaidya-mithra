const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

admin.initializeApp();

const TWO_FACTOR_API_KEY = defineSecret("TWO_FACTOR_API_KEY");

const TWO_FACTOR_ENDPOINT = "https://2factor.in/API/V1";

const parseProviderResponse = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
};

const markSmsRequest = (snapshot, status, details = {}) =>
  snapshot.ref.set(
    {
      status,
      attempts: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtClient: new Date().toISOString(),
      ...details,
    },
    { merge: true }
  );

exports.sendScheduledAppointmentSms = onDocumentCreated(
  {
    document: "artifacts/{appId}/sms_queue/{smsId}",
    region: "asia-south1",
    secrets: [TWO_FACTOR_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const request = snapshot.data();
    if (request.type !== "appointment_scheduled" || request.provider !== "2factor") {
      await markSmsRequest(snapshot, "skipped", {
        errorMessage: "Unsupported SMS request type or provider.",
      });
      return;
    }

    const apiKey = TWO_FACTOR_API_KEY.value();
    const senderId = process.env.TWO_FACTOR_SENDER_ID || process.env.TWO_FACTOR_FROM || "Vaidya";
    if (!apiKey || !senderId) {
      await markSmsRequest(snapshot, "failed", {
        errorMessage: "2Factor API key or sender ID is not configured.",
      });
      return;
    }

    if (!request.to || !request.message) {
      await markSmsRequest(snapshot, "failed", {
        errorMessage: "SMS request is missing recipient number or message.",
      });
      return;
    }

    const payload = {
      From: senderId,
      To: request.to,
      Msg: request.message,
    };

    if (request.sendAt) {
      payload.SendAt = request.sendAt;
    }

    try {
      const response = await fetch(
        `${TWO_FACTOR_ENDPOINT}/${apiKey}/ADDON_SERVICES/SEND/TSMS`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const responseText = await response.text();
      const providerResponse = parseProviderResponse(responseText);
      const providerStatus = String(
        providerResponse.Status || providerResponse.status || ""
      ).toLowerCase();
      const providerFailed =
        !response.ok || ["error", "failed", "failure"].includes(providerStatus);

      await markSmsRequest(snapshot, providerFailed ? "failed" : "sent", {
        providerStatus: providerResponse.Status || providerResponse.status || "",
        providerResponse,
        sentAt: providerFailed ? null : admin.firestore.FieldValue.serverTimestamp(),
        sentAtClient: providerFailed ? "" : new Date().toISOString(),
        errorMessage: providerFailed
          ? providerResponse.Details ||
            providerResponse.Message ||
            providerResponse.raw ||
            `2Factor returned HTTP ${response.status}.`
          : "",
      });
    } catch (error) {
      logger.error("Could not send scheduled appointment SMS.", error);
      await markSmsRequest(snapshot, "failed", {
        errorMessage: error.message || "2Factor request failed.",
      });
    }
  }
);
