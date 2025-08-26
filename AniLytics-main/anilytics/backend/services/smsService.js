import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

/**
 * Sends SMS alerts for critical inventory events
 *
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} SMS sending result
 */
export const sendSMS = async (phoneNumber, message) => {
  try {
    // In a real application, you would use an SMS API service
    // This is a placeholder implementation
    console.log(`SMS ALERT to ${phoneNumber}: ${message}`);

    // Mock successful response
    return {
      success: true,
      to: phoneNumber,
      message: message,
      timestamp: new Date().toISOString(),
    };

    /* 
    // Example implementation with an SMS API service like Twilio
    const response = await axios.post(
      'https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json',
      new URLSearchParams({
        To: phoneNumber,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: message
      }),
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );
    
    return response.data;
    */
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw new Error("Failed to send SMS alert");
  }
};

/**
 * Sends batch spoilage alert
 *
 * @param {Object} batchData - Data about the at-risk batch
 * @param {string} phoneNumber - Recipient phone number
 * @returns {Promise<Object>} SMS sending result
 */
export const sendSpoilageAlert = async (batchData, phoneNumber) => {
  const message = `
URGENT: Spoilage Risk Alert
Batch ID: ${batchData.id}
Variety: ${batchData.variety}
Quantity: ${batchData.quantity_kg} kg
Days Remaining: ${batchData.days_remaining}
Risk Level: ${batchData.spoilage_risk.toUpperCase()}
Action Required: Check storage conditions immediately
  `.trim();

  return await sendSMS(phoneNumber, message);
};

/**
 * Sends distribution recommendation alert
 *
 * @param {Object} recommendation - Distribution recommendation
 * @param {string} phoneNumber - Recipient phone number
 * @returns {Promise<Object>} SMS sending result
 */
export const sendDistributionAlert = async (recommendation, phoneNumber) => {
  const message = `
Distribution Alert: ${recommendation.priority}
${recommendation.description}
Reason: ${recommendation.reason}
Batches: ${recommendation.batches.length}
Total Quantity: ${Object.values(recommendation.allocation).reduce(
    (sum, qty) => sum + qty,
    0
  )} kg
  `.trim();

  return await sendSMS(phoneNumber, message);
};

/**
 * Sends storage condition alert
 *
 * @param {Object} storageData - Storage condition data
 * @param {string} phoneNumber - Recipient phone number
 * @returns {Promise<Object>} SMS sending result
 */
export const sendStorageConditionAlert = async (storageData, phoneNumber) => {
  const message = `
Storage Condition Alert
Location: ${storageData.storage_location}
Risk Level: ${storageData.risk_level.toUpperCase()}
Temperature: ${storageData.current_conditions.temperature}°C
Humidity: ${storageData.current_conditions.humidity}%
Action Required: 
${storageData.recommendations.temperature}
${storageData.recommendations.humidity}
  `.trim();

  return await sendSMS(phoneNumber, message);
};

/**
 * Sends inventory threshold alert
 *
 * @param {Object} inventoryData - Inventory threshold data
 * @param {string} phoneNumber - Recipient phone number
 * @returns {Promise<Object>} SMS sending result
 */
export const sendInventoryThresholdAlert = async (
  inventoryData,
  phoneNumber
) => {
  const message = `
Inventory Alert
Location: ${inventoryData.location}
Current Usage: ${inventoryData.current_usage_kg} kg (${
    inventoryData.usage_percent
  }%)
Status: ${inventoryData.status.toUpperCase()}
Recommendation: ${inventoryData.recommendation}
  `.trim();

  return await sendSMS(phoneNumber, message);
};
