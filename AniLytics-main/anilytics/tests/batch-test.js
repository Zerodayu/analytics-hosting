import axios from "axios";

const testBatchEndpoint = async () => {
  try {
    console.log("Testing batch endpoint...");
    console.log("URL: http://localhost:3000/api/batches");
    const response = await axios.get("http://localhost:3000/api/batches", {
      timeout: 5000, // 5 second timeout
      proxy: false, // Disable proxy
      headers: {
        "User-Agent": "AniLytics-Test/1.0",
        Accept: "application/json",
      },
    });
    console.log("Batch endpoint check successful!");
    console.log("Response status:", response.status);
    console.log("Count:", response.data.count);
    console.log("Success:", response.data.success);
  } catch (error) {
    console.error("Connection failed!");
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    if (error.request) {
      console.error(
        "Request details:",
        error.request._currentUrl || error.request.path
      );
    }

    console.error("Full error:", error);
  }
};

testBatchEndpoint();
