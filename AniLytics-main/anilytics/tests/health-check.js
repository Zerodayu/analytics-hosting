import axios from "axios";

const testHealthCheck = async () => {
  try {
    console.log("Testing health check endpoint...");
    console.log("URL: http://localhost:3000/health");
    const response = await axios.get("http://localhost:3000/health", {
      timeout: 5000, // 5 second timeout
      proxy: false, // Disable proxy
      headers: {
        "User-Agent": "AniLytics-Test/1.0",
        Accept: "application/json",
      },
    });
    console.log("Health check successful!");
    console.log("Response:", response.data);

    // Now try the API endpoint
    console.log("\nTesting API endpoint...");
    console.log("URL: http://localhost:3000/api");
    const apiResponse = await axios.get("http://localhost:3000/api", {
      timeout: 5000,
      proxy: false,
      headers: {
        "User-Agent": "AniLytics-Test/1.0",
        Accept: "application/json",
      },
    });
    console.log("API check successful!");
    console.log("Response:", apiResponse.data);
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

testHealthCheck();
