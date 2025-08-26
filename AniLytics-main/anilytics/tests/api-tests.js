import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create log file with timestamp
const logFile = path.join(
  logsDir,
  `api_test_${new Date().toISOString().replace(/:/g, "-")}.log`
);
const logger = fs.createWriteStream(logFile, { flags: "a" });

// API base URL
const API_URL = process.env.API_URL || "http://localhost:3000/api";

// Test timeout (in milliseconds)
const TEST_TIMEOUT = 10000; // 10 seconds

// Log function
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logger.write(logMessage + "\n");
};

// Error handling
const handleError = (error, context) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    log(
      `${context} ERROR: ${error.response.status} - ${JSON.stringify(
        error.response.data
      )}`
    );
  } else if (error.request) {
    // The request was made but no response was received
    log(`${context} ERROR: No response received - ${error.message}`);

    // Only log essential request properties to avoid circular references
    const requestDetails = {
      url: error.request._currentUrl || error.request.path || "unknown",
      method: error.request.method || "unknown",
      host: error.request.host || "unknown",
      port: error.request.port || "unknown",
    };

    log(`Request details: ${JSON.stringify(requestDetails, null, 2)}`);
  } else {
    // Something happened in setting up the request that triggered an Error
    log(`${context} ERROR: ${error.message}`);
  }

  if (error.code) {
    log(`Error code: ${error.code}`);
  }

  log(`Stack: ${error.stack ? error.stack.split("\n")[0] : "No stack trace"}`);
};

// Test helper function
const testEndpoint = async (
  method,
  endpoint,
  data = null,
  params = null,
  description = ""
) => {
  log(`Testing ${description || endpoint}...`);

  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AniLytics-ApiTest/1.0",
        Accept: "application/json",
      },
      timeout: TEST_TIMEOUT, // Use the defined timeout
      proxy: false, // Disable proxy
    };

    if (data) config.data = data;
    if (params) config.params = params;

    log(`Making request to: ${config.url}`);
    const response = await axios(config);
    log(`✅ ${description || endpoint} - Success (${response.status})`);
    log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
    return response.data;
  } catch (error) {
    handleError(error, description || endpoint);
    return null;
  }
};

// Main test function
const runTests = async () => {
  log("🚀 Starting API tests for AniLytics...");

  try {
    // ========== 1. BATCH MANAGEMENT TESTS ==========
    log("\n===== BATCH MANAGEMENT TESTS =====");

    // 1.1 Create a new batch
    const newBatchData = {
      variety: "Cavendish",
      quantity_kg: 100,
      harvest_date: new Date().toISOString().split("T")[0], // Today's date in YYYY-MM-DD
      source_farm: "Test Farm",
      storage_location: "Zone A",
      quality_grade: "A",
      temperature_requirement: "13-15",
      humidity_requirement: "90-95",
    };

    const createdBatch = await testEndpoint(
      "post",
      "/batches",
      newBatchData,
      null,
      "Create new batch"
    );

    if (!createdBatch || !createdBatch.data || !createdBatch.data.id) {
      log(
        "❌ Batch creation failed, cannot continue with batch-dependent tests"
      );
    } else {
      const batchId = createdBatch.data.id;
      log(`Created batch with ID: ${batchId}`);

      // 1.2 Get all batches
      await testEndpoint("get", "/batches", null, null, "Get all batches");

      // 1.3 Get single batch
      await testEndpoint(
        "get",
        `/batches/${batchId}`,
        null,
        null,
        "Get single batch"
      );

      // 1.4 Update batch
      const updateData = {
        quantity_kg: 95, // Simulating some loss
        temperature_actual: 14.5,
        humidity_actual: 92.3,
      };

      await testEndpoint(
        "put",
        `/batches/${batchId}`,
        updateData,
        null,
        "Update batch"
      );

      // 1.5 Mark batch for distribution
      const distributionData = {
        destination: "Local Market",
        transportation_type: "Refrigerated Truck",
        expected_delivery_date: new Date(Date.now() + 86400000)
          .toISOString()
          .split("T")[0], // Tomorrow
      };

      await testEndpoint(
        "put",
        `/batches/${batchId}/distribution`,
        distributionData,
        null,
        "Mark batch for distribution"
      );

      // 1.6 Get batches at risk
      await testEndpoint(
        "get",
        "/batches/risk/spoilage",
        null,
        null,
        "Get batches at risk of spoilage"
      );

      // ========== 2. INVENTORY MANAGEMENT TESTS ==========
      log("\n===== INVENTORY MANAGEMENT TESTS =====");

      // 2.1 Create inventory log
      const inventoryLogData = {
        batch_id: batchId,
        action: "removal",
        quantity_kg: 5,
        reason: "Quality check sample",
        performed_by: "Test User",
      };

      const createdLog = await testEndpoint(
        "post",
        "/inventory/logs",
        inventoryLogData,
        null,
        "Create inventory log"
      );

      if (createdLog && createdLog.data && createdLog.data.id) {
        const logId = createdLog.data.id;

        // 2.2 Get all inventory logs
        await testEndpoint(
          "get",
          "/inventory/logs",
          null,
          null,
          "Get all inventory logs"
        );

        // 2.3 Get single inventory log
        await testEndpoint(
          "get",
          `/inventory/logs/${logId}`,
          null,
          null,
          "Get single inventory log"
        );

        // 2.4 Update inventory log
        const updateLogData = {
          reason: "Quality check sample - Updated",
          notes: "Samples sent to lab for testing",
        };

        await testEndpoint(
          "put",
          `/inventory/logs/${logId}`,
          updateLogData,
          null,
          "Update inventory log"
        );
      }

      // 2.5 Get inventory summary
      await testEndpoint(
        "get",
        "/inventory/summary",
        null,
        null,
        "Get inventory summary"
      );

      // 2.6 Get storage capacity
      await testEndpoint(
        "get",
        "/inventory/storage/capacity",
        null,
        null,
        "Get storage capacity"
      );

      // ========== 3. REPORTING AND ANALYTICS TESTS ==========
      log("\n===== REPORTING AND ANALYTICS TESTS =====");

      // 3.1 Get spoilage forecast
      await testEndpoint(
        "get",
        "/reports/spoilage-forecast",
        null,
        null,
        "Get spoilage forecast"
      );

      // 3.2 Get distribution recommendations
      await testEndpoint(
        "get",
        "/reports/distribution-recommendations",
        null,
        null,
        "Get distribution recommendations"
      );

      // 3.3 Get inventory analytics
      await testEndpoint(
        "get",
        "/reports/inventory-analytics",
        null,
        null,
        "Get inventory analytics"
      );

      // 3.4 Get shipment analytics
      await testEndpoint(
        "get",
        "/reports/shipment-analytics",
        null,
        null,
        "Get shipment analytics"
      );

      // 3.5 Get storage recommendations
      await testEndpoint(
        "get",
        "/reports/storage-recommendations",
        null,
        null,
        "Get storage recommendations"
      );

      // ========== 4. QR CODE SERVICE TESTS ==========
      log("\n===== QR CODE SERVICE TESTS =====");

      // 4.1 Verify QR code was generated for batch
      const updatedBatch = await testEndpoint(
        "get",
        `/batches/${batchId}`,
        null,
        null,
        "Get batch to check QR code"
      );

      if (updatedBatch && updatedBatch.data && updatedBatch.data.qr_code_url) {
        log(
          `✅ QR code generation successful: ${updatedBatch.data.qr_code_url}`
        );
      } else {
        log("❌ QR code generation failed or not available in batch data");
      }

      // ========== 5. AI SERVICE TESTS ==========
      log("\n===== AI SERVICE TESTS =====");

      // 5.1 Generate content with AI
      const aiData = {
        prompt: "banana storage best practices",
        content: "provide 5 tips for optimal Cavendish banana storage",
      };

      await testEndpoint(
        "post",
        "/ai/generate",
        aiData,
        null,
        "Generate content with AI"
      );

      // ========== 6. CLEANUP (OPTIONAL) ==========
      // Uncomment this section if you want to delete the test data
      /*
      log('\n===== CLEANUP =====');
      
      // 6.1 Delete batch (this should cascade delete related records due to foreign keys)
      await testEndpoint('delete', `/batches/${batchId}`, null, null, 'Delete test batch');
      */
    }

    log("\n✅ API tests completed! Check the log file for details.");
    log(`Log file: ${logFile}`);
  } catch (error) {
    log(`❌ Test suite error: ${error.name}: ${error.message}`);

    // Only output first line of stack trace to avoid circular references
    if (error.stack) {
      const firstLine = error.stack.split("\n")[0];
      log(`Stack: ${firstLine}`);
    }
  } finally {
    logger.end();
  }
};

// Run the tests
runTests();
