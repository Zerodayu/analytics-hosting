import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import apiRoutes from "./routes/apiRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { sql } from "./config/db.js";

// Load environment variables
dotenv.config();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();

// Set port
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
app.use(morgan("dev")); // HTTP request logger

// Serve static files from the public directory
app.use(express.static(join(__dirname, "public")));

// API routes
app.use("/api", apiRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to AniLytics API",
    description:
      "AI-driven Agri-Warehouse Management system specialized for Cavendish bananas",
    documentation: "/api-docs",
    version: "1.0.0",
  });
});

// Error handling middleware
app.use(errorHandler);

// Frontend integration - If we decide to add a frontend later
if (process.env.NODE_ENV === "production") {
  // Uncomment when you have a frontend build
  // app.use(express.static(join(__dirname, '../frontend/dist')));
  // app.get('*', (req, res) => {
  //   res.sendFile(join(__dirname, '../frontend', 'dist', 'index.html'));
  // });
}

// Database Initialization
async function initDB() {
  try {
    // Create tables if they don't exist

    // Batches table
    await sql`
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        variety VARCHAR(100) NOT NULL,
        quantity_kg DECIMAL(10, 2) NOT NULL,
        harvest_date DATE NOT NULL,
        source_farm VARCHAR(255) NOT NULL,
        storage_location VARCHAR(100) NOT NULL,
        estimated_shelf_life INT DEFAULT 14,
        quality_grade VARCHAR(10) DEFAULT 'A',
        temperature_requirement VARCHAR(20) DEFAULT '13-15',
        humidity_requirement VARCHAR(20) DEFAULT '90-95',
        temperature_actual DECIMAL(5, 2),
        humidity_actual DECIMAL(5, 2),
        status VARCHAR(50) DEFAULT 'in_storage',
        spoilage_risk VARCHAR(20) DEFAULT 'low',
        destination VARCHAR(255),
        transportation_type VARCHAR(100),
        expected_delivery_date DATE,
        qr_code_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Inventory logs table
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_logs (
        id SERIAL PRIMARY KEY,
        batch_id INT REFERENCES batches(id),
        action VARCHAR(50) NOT NULL,
        quantity_kg DECIMAL(10, 2) NOT NULL,
        reason TEXT NOT NULL,
        performed_by VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        phone_number VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Shipments table
    await sql`
      CREATE TABLE IF NOT EXISTS shipments (
        id SERIAL PRIMARY KEY,
        batch_id INT REFERENCES batches(id),
        destination VARCHAR(255) NOT NULL,
        transportation_type VARCHAR(100) NOT NULL,
        expected_delivery_date DATE,
        actual_delivery_date DATE,
        status VARCHAR(50) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Start server after DB initialization
initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  // In production, you might want to exit the process here
  process.exit(1);
});
