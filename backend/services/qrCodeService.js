import axios from "axios";

/**
 * Generates a QR code for tracking inventory items
 *
 * @param {string} data - JSON string containing data to encode in QR code
 * @returns {Promise<string>} URL to the generated QR code
 */
export const generateQRCode = async (data) => {
  try {
    // Use a QR code generation service
    // In a production environment, you might want to use a more reliable service
    // or generate QR codes locally
    const response = await axios.get(
      "https://api.qrserver.com/v1/create-qr-code/",
      {
        params: {
          data,
          size: "200x200",
          format: "png",
        },
        responseType: "arraybuffer",
      }
    );

    // In a real app, you'd upload this to your storage service
    // For this example, we'll return the URL to the QR code service
    return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
      data
    )}&size=200x200`;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
};

/**
 * Reads a QR code from an image URL or base64 string
 *
 * @param {string} imageData - URL or base64 encoded image data
 * @returns {Promise<string>} Decoded data from the QR code
 */
export const readQRCode = async (imageData) => {
  try {
    // Use a QR code reading service
    const response = await axios.post(
      "https://api.qrserver.com/v1/read-qr-code/",
      {
        file: imageData,
      }
    );

    if (
      response.data &&
      response.data[0] &&
      response.data[0].symbol &&
      response.data[0].symbol[0]
    ) {
      return response.data[0].symbol[0].data;
    }

    throw new Error("No QR code data found");
  } catch (error) {
    console.error("Error reading QR code:", error);
    throw new Error("Failed to read QR code");
  }
};

/**
 * Validates batch data by checking QR code against database
 *
 * @param {Object} qrData - Data decoded from QR code
 * @param {Object} databaseData - Data from database for validation
 * @returns {Object} Validation result
 */
export const validateBatchQRCode = (qrData, databaseData) => {
  // Parse QR data if it's a string
  const qrDataObj = typeof qrData === "string" ? JSON.parse(qrData) : qrData;

  // Basic validation
  const isValid =
    qrDataObj.id === databaseData.id &&
    qrDataObj.variety === databaseData.variety &&
    qrDataObj.harvest_date === databaseData.harvest_date;

  return {
    isValid,
    qrData: qrDataObj,
    databaseData,
    reason: isValid ? "QR code valid" : "QR code data does not match database",
  };
};

/**
 * Generates a printable label with QR code and batch information
 *
 * @param {Object} batchData - Batch data for the label
 * @returns {string} HTML string for the label
 */
export const generateBatchLabel = (batchData) => {
  const qrCodeUrl = batchData.qr_code_url;

  // Generate a simple HTML template for the label
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .label-container {
          width: 400px;
          padding: 10px;
          border: 1px solid #000;
          font-family: Arial, sans-serif;
        }
        .header {
          text-align: center;
          font-weight: bold;
          font-size: 18px;
          margin-bottom: 10px;
        }
        .qr-container {
          text-align: center;
          margin-bottom: 10px;
        }
        .qr-code {
          width: 150px;
          height: 150px;
        }
        .info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
        }
        .info-item {
          margin-bottom: 5px;
        }
        .label {
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 10px;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="label-container">
        <div class="header">AniLytics Cavendish Bananas</div>
        <div class="qr-container">
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code">
        </div>
        <div class="info">
          <div class="info-item">
            <span class="label">Batch ID:</span> ${batchData.id}
          </div>
          <div class="info-item">
            <span class="label">Variety:</span> ${batchData.variety}
          </div>
          <div class="info-item">
            <span class="label">Quantity:</span> ${batchData.quantity_kg} kg
          </div>
          <div class="info-item">
            <span class="label">Quality:</span> ${
              batchData.quality_grade || "A"
            }
          </div>
          <div class="info-item">
            <span class="label">Harvest:</span> ${new Date(
              batchData.harvest_date
            ).toLocaleDateString()}
          </div>
          <div class="info-item">
            <span class="label">Source:</span> ${batchData.source_farm}
          </div>
        </div>
        <div class="footer">
          Scan QR code for real-time batch information
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
};
