import express from "express";
import * as batchController from "../controllers/batchController.js";
import * as inventoryController from "../controllers/inventoryController.js";
import * as reportController from "../controllers/reportController.js";
import aiRoutes from "./aiRoutes.js";

const router = express.Router();

// API root route
router.get("/", (req, res) => {
  res.json({
    message: "Welcome to AniLytics API",
    description:
      "AI-driven Agri-Warehouse Management system specialized for Cavendish bananas",
    endpoints: {
      batches: "/api/batches",
      inventory: "/api/inventory",
      reports: "/api/reports",
      ai: "/api/ai",
    },
    version: "1.0.0",
  });
});

// Batch routes
router.get("/batches", batchController.getBatches);
router.post("/batches", batchController.createBatch);
router.get("/batches/:id", batchController.getBatch);
router.put("/batches/:id", batchController.updateBatch);
router.delete("/batches/:id", batchController.deleteBatch);
router.put("/batches/:id/distribution", batchController.markForDistribution);
router.get("/batches/risk/spoilage", batchController.getBatchesAtRisk);

// Inventory routes
router.get("/inventory/logs", inventoryController.getInventoryLogs);
router.post("/inventory/logs", inventoryController.createInventoryLog);
router.get("/inventory/logs/:id", inventoryController.getInventoryLog);
router.put("/inventory/logs/:id", inventoryController.updateInventoryLog);
router.get("/inventory/summary", inventoryController.getInventorySummary);
router.get(
  "/inventory/storage/capacity",
  inventoryController.getStorageCapacity
);

// Report and analytics routes
router.get("/reports/spoilage-forecast", reportController.getSpoilageForecast);
router.get(
  "/reports/distribution-recommendations",
  reportController.getDistributionRecommendations
);
router.get(
  "/reports/inventory-analytics",
  reportController.getInventoryAnalytics
);
router.get(
  "/reports/shipment-analytics",
  reportController.getShipmentAnalytics
);
router.get(
  "/reports/storage-recommendations",
  reportController.getStorageRecommendations
);

// AI routes
router.use("/ai", aiRoutes);

export default router;
