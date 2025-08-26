import { sql } from "../config/db.js";
import { generateQRCode } from "../services/qrCodeService.js";

// Get all batches with optional filtering
export const getBatches = async (req, res) => {
  try {
    const { status, location, daysUntilExpiry } = req.query;

    let query = sql`
      SELECT b.*, 
        EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
      FROM batches b
      WHERE 1=1
    `;

    if (status) {
      query = sql`${query} AND b.status = ${status}`;
    }

    if (location) {
      query = sql`${query} AND b.storage_location = ${location}`;
    }

    if (daysUntilExpiry) {
      query = sql`${query} AND EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= ${daysUntilExpiry}`;
    }

    query = sql`${query} ORDER BY days_remaining ASC`;

    const batches = await query;

    console.log("Fetched batches", batches.length);
    res.status(200).json({
      success: true,
      count: batches.length,
      data: batches,
    });
  } catch (error) {
    console.log("Error in getBatches function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Create a new batch of bananas
export const createBatch = async (req, res) => {
  const {
    variety,
    quantity_kg,
    harvest_date,
    source_farm,
    storage_location,
    estimated_shelf_life,
    quality_grade,
    temperature_requirement,
    humidity_requirement,
  } = req.body;

  if (
    !variety ||
    !quantity_kg ||
    !harvest_date ||
    !source_farm ||
    !storage_location
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Required fields: variety, quantity_kg, harvest_date, source_farm, storage_location",
    });
  }

  try {
    // Default values for Cavendish if not specified
    const shelfLife = estimated_shelf_life || 14; // 14 days default for Cavendish
    const tempReq = temperature_requirement || "13-15"; // 13-15°C ideal for Cavendish
    const humidReq = humidity_requirement || "90-95"; // 90-95% humidity ideal

    const newBatch = await sql`
      INSERT INTO batches (
        variety, 
        quantity_kg,
        harvest_date,
        source_farm,
        storage_location,
        estimated_shelf_life,
        quality_grade,
        temperature_requirement,
        humidity_requirement,
        status
      )
      VALUES (
        ${variety},
        ${quantity_kg},
        ${harvest_date},
        ${source_farm},
        ${storage_location},
        ${shelfLife},
        ${quality_grade || "A"},
        ${tempReq},
        ${humidReq},
        ${"in_storage"}
      )
      RETURNING *
    `;

    // Generate QR code for the batch
    const batchId = newBatch[0].id;
    const qrCodeData = {
      id: batchId,
      variety,
      quantity_kg,
      harvest_date,
      source_farm,
    };

    const qrCodeUrl = await generateQRCode(JSON.stringify(qrCodeData));

    // Update batch with QR code URL
    const updatedBatch = await sql`
      UPDATE batches
      SET qr_code_url = ${qrCodeUrl}
      WHERE id = ${batchId}
      RETURNING *
    `;

    res.status(201).json({
      success: true,
      data: updatedBatch[0],
      message: "Batch created successfully with QR code",
    });
  } catch (error) {
    console.log("Error in createBatch function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get a single batch by ID
export const getBatch = async (req, res) => {
  const { id } = req.params;

  try {
    const batch = await sql`
      SELECT b.*, 
        EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
      FROM batches b
      WHERE b.id = ${id}
    `;

    if (batch.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    res.status(200).json({ success: true, data: batch[0] });
  } catch (error) {
    console.log("Error in getBatch function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Update batch details
export const updateBatch = async (req, res) => {
  const { id } = req.params;
  const {
    quantity_kg,
    storage_location,
    status,
    quality_grade,
    temperature_actual,
    humidity_actual,
  } = req.body;

  try {
    // First get the current batch to check what's changed
    const currentBatch = await sql`SELECT * FROM batches WHERE id = ${id}`;

    if (currentBatch.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Create inventory log if quantity has changed
    if (quantity_kg && quantity_kg !== currentBatch[0].quantity_kg) {
      const quantityDiff = currentBatch[0].quantity_kg - quantity_kg;
      const action = quantityDiff > 0 ? "removal" : "addition";

      await sql`
        INSERT INTO inventory_logs (
          batch_id,
          action,
          quantity_kg,
          reason,
          performed_by
        )
        VALUES (
          ${id},
          ${action},
          ${Math.abs(quantityDiff)},
          ${"Manual adjustment"},
          ${req.user?.id || "system"}
        )
      `;
    }

    const updatedBatch = await sql`
      UPDATE batches
      SET 
        quantity_kg = COALESCE(${quantity_kg}, quantity_kg),
        storage_location = COALESCE(${storage_location}, storage_location),
        status = COALESCE(${status}, status),
        quality_grade = COALESCE(${quality_grade}, quality_grade),
        temperature_actual = COALESCE(${temperature_actual}, temperature_actual),
        humidity_actual = COALESCE(${humidity_actual}, humidity_actual),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    // Calculate spoilage risk based on conditions
    let spoilageRisk = "low";

    // Check temperature against requirements
    if (temperature_actual) {
      const [minTemp, maxTemp] = currentBatch[0].temperature_requirement
        .split("-")
        .map(Number);
      if (
        temperature_actual < minTemp - 2 ||
        temperature_actual > maxTemp + 2
      ) {
        spoilageRisk = "high";
      } else if (temperature_actual < minTemp || temperature_actual > maxTemp) {
        spoilageRisk = "medium";
      }
    }

    // Check humidity against requirements
    if (humidity_actual && spoilageRisk !== "high") {
      const [minHumid, maxHumid] = currentBatch[0].humidity_requirement
        .split("-")
        .map(Number);
      if (humidity_actual < minHumid - 5 || humidity_actual > maxHumid + 5) {
        spoilageRisk = "high";
      } else if (humidity_actual < minHumid || humidity_actual > maxHumid) {
        spoilageRisk = spoilageRisk === "medium" ? "high" : "medium";
      }
    }

    // Update spoilage risk if conditions warranted
    if (temperature_actual || humidity_actual) {
      await sql`
        UPDATE batches
        SET spoilage_risk = ${spoilageRisk}
        WHERE id = ${id}
      `;
    }

    res.status(200).json({
      success: true,
      data: updatedBatch[0],
      spoilageRisk,
    });
  } catch (error) {
    console.log("Error in updateBatch function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Mark batch for distribution/shipping
export const markForDistribution = async (req, res) => {
  const { id } = req.params;
  const { destination, transportation_type, expected_delivery_date } = req.body;

  if (!destination || !transportation_type) {
    return res.status(400).json({
      success: false,
      message: "Destination and transportation type are required",
    });
  }

  try {
    const batch = await sql`SELECT * FROM batches WHERE id = ${id}`;

    if (batch.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Update batch status to 'pending_shipment'
    const updatedBatch = await sql`
      UPDATE batches
      SET 
        status = 'pending_shipment',
        destination = ${destination},
        transportation_type = ${transportation_type},
        expected_delivery_date = ${expected_delivery_date || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    // Create shipment record
    await sql`
      INSERT INTO shipments (
        batch_id,
        destination,
        transportation_type,
        expected_delivery_date,
        status
      )
      VALUES (
        ${id},
        ${destination},
        ${transportation_type},
        ${expected_delivery_date || null},
        'scheduled'
      )
    `;

    res.status(200).json({
      success: true,
      data: updatedBatch[0],
      message: "Batch marked for distribution successfully",
    });
  } catch (error) {
    console.log("Error in markForDistribution function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get batches at risk of spoilage
export const getBatchesAtRisk = async (req, res) => {
  try {
    const { days = 3 } = req.query; // Default to 3 days

    const atRiskBatches = await sql`
      SELECT b.*, 
        EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
      FROM batches b
      WHERE 
        (EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= ${days}
        OR b.spoilage_risk IN ('medium', 'high'))
        AND b.status IN ('in_storage', 'pending_shipment')
      ORDER BY days_remaining ASC, 
        CASE 
          WHEN b.spoilage_risk = 'high' THEN 1 
          WHEN b.spoilage_risk = 'medium' THEN 2
          ELSE 3
        END
    `;

    res.status(200).json({
      success: true,
      count: atRiskBatches.length,
      data: atRiskBatches,
    });
  } catch (error) {
    console.log("Error in getBatchesAtRisk function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Delete a batch (mostly for administrative purposes)
export const deleteBatch = async (req, res) => {
  const { id } = req.params;

  try {
    // First check if the batch exists
    const batch = await sql`SELECT * FROM batches WHERE id = ${id}`;

    if (batch.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Delete the batch
    const deletedBatch = await sql`
      DELETE FROM batches WHERE id = ${id} RETURNING *
    `;

    res.status(200).json({
      success: true,
      data: deletedBatch[0],
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.log("Error in deleteBatch function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
